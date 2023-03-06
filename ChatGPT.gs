const LINE_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');
const OPENAI_APIKEY = PropertiesService.getScriptProperties().getProperty('OPENAI_APIKEY');
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const ENCRYPTION_KEY = PropertiesService.getScriptProperties().getProperty('ENCRYPTION_KEY');

const explanation = '私は、OpenAIが開発した自然言語処理の人工知能、ChatGPTです。多くの言語で対話ができ、質問に答えたり、会話を進めたりすることができます。\n\n会話の内容を正確に記憶するために会話記録を保存していますが、セキュリティの為会話記録を安全性の高いAESで暗号化しています。\n\n【会話記録を削除する】\n「削除」と送信してください。\n【ChatBotに人格を与える】\n先頭に「###人格設定###」という文言を付与し、詳細情報(性格、口調など)を送信して下さい。\n【人格設定を削除する】\n先頭に「###人格設定###」という文言を付与した上で「人格削除」と送信して下さい。\n【再度説明を聞く】\n「説明書」と送信してください。\n\n会話記録が増加していくと、応答速度が低下する場合があることをご了承ください。'

function doPost(e) {
  try {
    const event = JSON.parse(e.postData.contents).events[0];
    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const userMessage = event.message.text;

    if (!userMessage) {
      const text = '申し訳ありません。メッセージ以外は受け付けておりません。';
      replyToUser(replyToken, text);
      return;
    }

    const sheet = getOrCreateSheet(userId);

    if (userMessage === '説明書') {
      const text = explanation;
      replyToUser(replyToken, text);
      return;
    }
    if (userMessage === '削除') {
      deleteSheet(sheet);
      const text = '記憶を抹消しました。';
      replyToUser(replyToken, text);
      return;
    }
    if (userMessage.match(/###人格設定###/)) {
      createOrDeleteSystem(sheet, userMessage);
      const text = '人格の設定を変更しました。';
      replyToUser(replyToken, text);
      return;
    }

    let context = getContext(sheet);
    context.push({'role': 'user', 'content': userMessage});
    context.push(getSystemSettinrg(sheet));
    const requestOptions = {
      "method": "post",
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer "+ OPENAI_APIKEY
      },
      "payload": JSON.stringify({
        "model": "gpt-3.5-turbo",
        "messages": context
      })
    };
    const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", requestOptions);
    const responseText = response.getContentText();
    const json = JSON.parse(responseText);
    const text = json['choices'][0]['message']['content'].trim();

    // 現在のログの最後の行を取得する
    const lastRow = sheet.getLastRow();
    const lastPrompt = sheet.getRange(lastRow, 1).getValue();

    // ログに新しいメッセージと応答を追加する
    sheet.getRange(lastRow + 1, 1, 1, 2).setValues([[encryptString(userMessage), encryptString(text)]]);

    // ユーザーに応答を返信
    replyToUser(replyToken, text);

  } catch (e) {
    const text = 'システムエラーが発生しました。もう一度お試し下さい。';
    replyToUser(replyToken, text);
    console.error(e);
  }
}

function getOrCreateSheet(userId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(userId);
  if (!sheet) {
    sheet = ss.insertSheet(userId);
    sheet.appendRow(['User', 'ChatGPT']);
  }
  return sheet;
}

function deleteSheet(sheet) {
  const ss = sheet.getParent();
  ss.deleteSheet(sheet);
}

function getContext(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return [];
  }
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  let context = [];
  for (const value of values) {
    const userMessage = value[0];
    const chatGPTMessage = value[1];
    context.push({'role': 'user', 'content': decryptString(userMessage)});
    context.push({'role': 'assistant', 'content': decryptString(chatGPTMessage)});
  }
  return context;
}

function createOrDeleteSystem(sheet, userMessage){
  if (userMessage.match(/人格削除/)){
    sheet.getRange("G1").setValue('');
    return;
  }
  let systemStetting = userMessage.replace('###人格設定###', '');
  sheet.getRange("G1").setValue(encryptString(systemStetting));
}

function getSystemSettinrg(sheet){
  const systemStting = sheet.getRange("G1").getValue();
  const context ={'role': 'system', 'content': decryptString(systemStting)};
  return context;
}
// 文字列をAES128で暗号化する関数
function encryptString(inputString) {
  var cipher = new cCryptoGS.Cipher(ENCRYPTION_KEY, 'aes');
  var encrypted = cipher.encrypt(inputString);
  return encrypted;
}

// 暗号化された文字列を複合化する関数
function decryptString(encryptedString) {
  var cipher = new cCryptoGS.Cipher(ENCRYPTION_KEY, 'aes');
  var decrypted = cipher.decrypt(encryptedString);
  return decrypted;
}

function replyToUser(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  UrlFetchApp.fetch(url, {
    'headers': {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN,
    },
    'method': 'post',
    'payload': JSON.stringify({
      'replyToken': replyToken,
      'messages': [{
        'type': 'text',
        'text': text,
      }]
    })
  });
}

