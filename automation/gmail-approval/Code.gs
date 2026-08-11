const SHEET_NAME = 'article_approvals';
const DEFAULT_OWNER_EMAIL = 'shinozaki@meolabo.com';
const APP_NAME = 'LAM COMPANY 記事承認';
const EMAIL_MARKER = '[LAM-ARTICLE-APPROVAL]';

// 記事候補テーマ。毎週 sendApprovalDigest() が 3 件ずつメール送信する。
// slot は表示番号（1〜3）。定期的に新テーマを追加すること。
const DEFAULT_TOPICS = [
  {
    slot: '1',
    title: 'AIで変わる中小企業の採用活動｜求人票・面接補助・書類選考への活用',
    angle: '採用DX',
    keyword: '中小企業 採用 AI 活用',
  },
  {
    slot: '2',
    title: '中小企業がAIで営業資料・提案書を効率化する方法',
    angle: '営業効率化',
    keyword: '営業資料 AI 提案書 効率化',
  },
  {
    slot: '3',
    title: 'AI活用でカスタマーサポートを自動化する方法｜FAQ・チャットボット・対応品質の均一化',
    angle: '顧客対応自動化',
    keyword: 'カスタマーサポート AI 自動化 中小企業',
  },
];

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    ownerEmail: props.getProperty('OWNER_EMAIL') || DEFAULT_OWNER_EMAIL,
    deployHookUrl: props.getProperty('DEPLOY_HOOK_URL') || '',
    anthropicApiKey: props.getProperty('ANTHROPIC_API_KEY') || '',
    anthropicModel: props.getProperty('ANTHROPIC_MODEL') || 'claude-sonnet-4-6',
    sheetId: props.getProperty('SHEET_ID') || '',
    sheetName: props.getProperty('SHEET_NAME') || SHEET_NAME,
    feedToken: props.getProperty('FEED_TOKEN') || '',
  };
}

function setupApprovalSheet() {
  const config = getConfig_();
  if (!config.sheetId) {
    throw new Error('SHEET_ID を Script Properties に設定してください');
  }
  const ss = SpreadsheetApp.openById(config.sheetId);
  let sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) sheet = ss.insertSheet(config.sheetName);
  const header = [[
    'topic_id',
    'slot',
    'status',
    'candidate_title',
    'keyword',
    'angle',
    'selected_reply',
    'article_slug',
    'article_title',
    'article_description',
    'article_body_json',
    'approval_subject',
    'sent_at',
    'approved_at',
    'published_at',
    'notes',
  ]];
  sheet.clearContents();
  sheet.getRange(1, 1, 1, header[0].length).setValues(header);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header[0].length);
}

function seedDefaultTopics() {
  const config = getConfig_();
  if (!config.sheetId) {
    throw new Error('SHEET_ID を Script Properties に設定してください');
  }
  const ss = SpreadsheetApp.openById(config.sheetId);
  const sheet = ss.getSheetByName(config.sheetName) || ss.insertSheet(config.sheetName);
  if (sheet.getLastRow() === 0) {
    setupApprovalSheet();
  }

  const existing = new Set();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    rows.forEach((row) => {
      if (row[0]) existing.add(String(row[0]));
    });
  }

  const nextRows = DEFAULT_TOPICS
    .filter((topic) => !existing.has(topic.slot))
    .map((topic) => ([
      `topic-${Utilities.getUuid()}`,
      topic.slot,
      'READY_TO_SEND',
      topic.title,
      topic.keyword,
      topic.angle,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]));

  if (nextRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, nextRows.length, nextRows[0].length).setValues(nextRows);
  }
}

function sendApprovalDigest() {
  seedDefaultTopics();
  const config = getConfig_();
  const ss = SpreadsheetApp.openById(config.sheetId);
  const sheet = ss.getSheetByName(config.sheetName);
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1).filter((row) => row[2] === 'READY_TO_SEND');
  if (rows.length === 0) return;

  const subject = `${EMAIL_MARKER} 次回記事候補 ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm')}`;
  const bodyLines = [
    `${APP_NAME} の次回記事候補です。`,
    '',
    '返信は番号だけで大丈夫です。',
    '',
    ...rows.slice(0, 3).map((row) => `${row[1]}. ${row[3]} / ${row[5]} / ${row[4]}`),
    '',
    '返信例: 1',
    '',
    '承認後は、選ばれたテーマを下書き生成し、公開準備へ進めます。',
  ];

  GmailApp.sendEmail(config.ownerEmail, subject, bodyLines.join('\n'));

  const sentAt = new Date();
  rows.slice(0, 3).forEach((row) => {
    const r = findRowByTopicId_(sheet, row[0]);
    if (!r) return;
    sheet.getRange(r, 3).setValue('SENT');
    sheet.getRange(r, 12).setValue(subject);
    sheet.getRange(r, 13).setValue(sentAt);
  });
}

function pollApprovalReplies() {
  const config = getConfig_();
  if (!config.sheetId) return;
  const ss = SpreadsheetApp.openById(config.sheetId);
  const sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) return;

  const query = `from:me subject:"${EMAIL_MARKER}" newer_than:7d`;
  const threads = GmailApp.search(query, 0, 20);
  threads.forEach((thread) => {
    const messages = thread.getMessages();
    const pendingRows = sheet.getDataRange().getValues().slice(1).filter((row) => row[2] === 'SENT');
    if (pendingRows.length === 0) return;
    const target = pendingRows[0];
    const rowIndex = findRowByTopicId_(sheet, target[0]);
    if (!rowIndex) return;

    const sentAtValue = target[12];
    const sentAt = sentAtValue ? new Date(sentAtValue) : null;
    if (!sentAt || Number.isNaN(sentAt.getTime())) return;

    let selection = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.getDate() <= sentAt) continue;
      const body = `${message.getPlainBody()}\n${message.getBody()}`;
      selection = parseSelection_(body);
      if (selection) break;
    }
    if (!selection) return;

    const selectedTopic = DEFAULT_TOPICS.find((topic) => topic.slot === String(selection));
    if (!selectedTopic) return;

    const article = generateArticleDraft_(selectedTopic);
    sheet.getRange(rowIndex, 3).setValue('APPROVED');
    sheet.getRange(rowIndex, 7).setValue(String(selection));
    sheet.getRange(rowIndex, 8).setValue(article.slug);
    sheet.getRange(rowIndex, 9).setValue(article.title);
    sheet.getRange(rowIndex, 10).setValue(article.description);
    sheet.getRange(rowIndex, 11).setValue(JSON.stringify(article));
    sheet.getRange(rowIndex, 14).setValue(new Date());
    sheet.getRange(rowIndex, 16).setValue('Approved from Gmail reply.');

    if (config.deployHookUrl) {
      try {
        UrlFetchApp.fetch(config.deployHookUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            articleSlug: article.slug,
            articleTitle: article.title,
            source: 'gmail-approval',
          }),
          muteHttpExceptions: true,
        });
        sheet.getRange(rowIndex, 15).setValue(new Date());
      } catch (error) {
        sheet.getRange(rowIndex, 16).setValue(`Deploy hook failed: ${error.message}`);
      }
    }

    GmailApp.sendEmail(
      config.ownerEmail,
      `${EMAIL_MARKER} 承認完了 ${article.title}`,
      [
        '承認を受け付けました。',
        '',
        `タイトル: ${article.title}`,
        `slug: ${article.slug}`,
        `状態: APPROVED`,
      ].join('\n')
    );
  });
}

function generateArticleDraft_(topic) {
  const config = getConfig_();
  const prompt = [
    'あなたは株式会社 LAM COMPANYの上級コンテンツ編集者です。',
    '中小企業向けのAI導入・定着支援をテーマに、SEO検索で上位を狙える実践的な日本語記事を作成してください。',
    '',
    '## 記事の品質基準',
    '- 読者は「IT担当者がいない中小企業の経営者・管理職」',
    '- 抽象論を避け、現場で今すぐ使える具体的な内容にする',
    '- 各セクションに具体例・数字・比較・ツール名を入れる',
    '- 検索キーワードで来た読者の疑問に直接答える実用記事にする',
    '- 読了時間の目安は10〜15分（文字数：3000〜4500字相当）',
    '',
    '## セクション構成の指示',
    '- sections は 7〜9 個用意する',
    '- 各セクションの body は 3〜5 文で、具体例や手順を含めること',
    '- 「なぜ重要か」「具体的にどうするか」「失敗しないためのポイント」を各セクションに入れる',
    '- 途中に「注意点」「よくある失敗」「チェックすべきこと」のセクションを必ず入れる',
    '',
    `## 今回のテーマ`,
    `テーマ: ${topic.title}`,
    `切り口: ${topic.angle}`,
    `狙いキーワード: ${topic.keyword}`,
    '',
    '## 出力形式（このJSONのみ返すこと。説明文・Markdownコードブロック不要）',
    '{"slug":"url-safe-english-slug","title":"記事タイトル（40字以内・キーワード含む）","description":"meta description（120字以内・キーワード含む）","eyebrow":"カテゴリ英語大文字（例：AI STRATEGY）","lead":"リード文（150字以内・読者の悩みから入る）","sections":[{"heading":"見出し","body":["段落1（具体例含む）","段落2（数字や比較含む）","段落3（行動できるアドバイス）"]}],"ctaLabel":"ボタンラベル","ctaHref":"/#contact","keywords":["キーワード1","キーワード2","キーワード3"]}',
  ].join('\n');

  if (!config.anthropicApiKey) {
    return {
      slug: buildSlug_(topic.title),
      title: topic.title,
      description: `${topic.title} を現場目線で整理した記事です。`,
      eyebrow: topic.angle,
      lead: `${topic.title} の要点を、実務で使える形にまとめます。`,
      sections: [
        { heading: '導入', body: ['まずは課題の全体像を整理します。'] },
        { heading: '実務への置き換え', body: ['現場で試しやすい順番に落とし込みます。'] },
        { heading: '進め方', body: ['小さく試して改善する流れを前提にします。'] },
      ],
      ctaLabel: '相談する',
      ctaHref: '/#contact',
      keywords: [topic.keyword],
      generatedAt: new Date().toISOString(),
    };
  }

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 4096,
      temperature: 0.4,
      system: 'JSONだけを返す編集支援です。',
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(`Anthropic API error: ${response.getResponseCode()}`);
  }

  const data = JSON.parse(response.getContentText());
  const text = data.content && data.content[0] && data.content[0].text ? data.content[0].text.trim() : '';
  if (!text) throw new Error('Article draft was empty');
  const article = JSON.parse(text);
  if (!article.slug) article.slug = buildSlug_(topic.title);
  if (!article.title) article.title = topic.title;
  if (!article.description) article.description = `${topic.title} を現場目線で整理した記事です。`;
  if (!article.eyebrow) article.eyebrow = topic.angle;
  if (!article.lead) article.lead = `${topic.title} の要点を、実務で使える形にまとめます。`;
  if (!article.ctaLabel) article.ctaLabel = '相談する';
  if (!article.ctaHref) article.ctaHref = '/#contact';
  if (!Array.isArray(article.sections) || article.sections.length === 0) {
    article.sections = [{ heading: '導入', body: ['記事の内容が取得できませんでした。'] }];
  }
  if (!Array.isArray(article.keywords)) article.keywords = [topic.keyword];
  article.generatedAt = new Date().toISOString();
  return article;
}

function doGet(e) {
  const config = getConfig_();
  const token = e && e.parameter ? e.parameter.token : '';
  if (config.feedToken && token !== config.feedToken) {
    return ContentService.createTextOutput('Forbidden').setMimeType(ContentService.MimeType.TEXT);
  }

  if (!config.sheetId) {
    return ContentService.createTextOutput(JSON.stringify({ articles: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.openById(config.sheetId);
  const sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ articles: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const values = sheet.getDataRange().getValues();
  const articles = values.slice(1)
    .filter((row) => row[2] === 'APPROVED')
    .map((row) => {
      const payload = row[10] ? safeJsonParse_(row[10], {}) : {};
      return {
        slug: row[7] || payload.slug || '',
        title: row[8] || payload.title || row[3] || '',
        description: row[9] || payload.description || '',
        eyebrow: payload.eyebrow || row[5] || '',
        lead: payload.lead || '',
        sections: payload.sections || [],
        ctaLabel: payload.ctaLabel || '相談する',
        ctaHref: payload.ctaHref || '/#contact',
        keywords: payload.keywords || [],
        publishedAt: row[14] ? new Date(row[14]).toISOString() : '',
      };
    });

  return ContentService.createTextOutput(JSON.stringify({ articles }))
    .setMimeType(ContentService.MimeType.JSON);
}

function findRowByTopicId_(sheet, topicId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.indexOf(topicId);
  return idx >= 0 ? idx + 2 : 0;
}

function parseSelection_(body) {
  const normalized = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return 0;

  const firstLine = normalized
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return 0;

  const match = firstLine.match(/^([1-3])(?:\s|$|[.)、．])/);
  return match ? Number(match[1]) : 0;
}

function buildSlug_(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `article-${Date.now()}`;
}

function safeJsonParse_(input, fallback) {
  try {
    return JSON.parse(input);
  } catch (error) {
    return fallback;
  }
}
