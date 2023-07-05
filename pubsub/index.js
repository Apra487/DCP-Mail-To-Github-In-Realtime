const Auth = require('@google-cloud/express-oauth2-handlers');
const {Datastore} = require('@google-cloud/datastore');
const {google} = require('googleapis');
const gmail = google.gmail('v1');
const axios = require('axios');

const COMPUTE_ENGINE_URL = process.env.COMPUTE_ENGINE_URL;

const datastoreClient = new Datastore();

const requiredScopes = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.modify',
];

const auth = Auth('datastore', requiredScopes, 'email', true);

const checkForDuplicateNotifications = async (messageId) => {
  const transaction = datastoreClient.transaction();
  await transaction.run();
  const messageKey = datastoreClient.key(['emailNotifications', messageId]);
  const [message] = await transaction.get(messageKey);
  if (!message) {
    await transaction.save({
      key: messageKey,
      data: {}
    });
  }
  await transaction.commit();
  if (!message) {
    return messageId;
  }
};

const getMostRecentMessageWithTag = async (email, historyId) => {
  // Look up the most recent message.
  const listMessagesRes = await gmail.users.messages.list({
    userId: email,
    maxResults: 1
  });
  const messageId = await checkForDuplicateNotifications(listMessagesRes.data.messages[0].id);

  // Get the message using the message ID.
  if (messageId) {
    const message = await gmail.users.messages.get({
      userId: email,
      id: messageId
    });

    return message;
  }
};

// Extract message ID, sender, attachment filename and attachment ID
// from the message.
const extractInfoFromMessage = (message) => {
  const messageId = message.data.id;
  let from;
  let filename;
  let attachmentId;
  let subject;

  const headers = message.data.payload.headers;
  for (let i in headers) {

    console.log('header name' , headers[i].name, 'header value', headers[i].value)
    if (headers[i].name === 'From') {
      from = headers[i].value;
    }
    if (headers[i].name === 'Subject') {
      console.log('subject is present')
      subject = headers[i].value;
    }
  }

  const payloadParts = message.data.payload.parts;

  const rawText = Buffer.from(payloadParts[0]?.body?.data, 'base64').toString('ascii');
  const html = Buffer.from(payloadParts[1]?.body?.data, 'base64').toString('ascii');

  for (let j in payloadParts) {
    if (payloadParts[j].body.attachmentId) {
      filename = payloadParts[j].filename;
      attachmentId = payloadParts[j].body.attachmentId;
    }
  }

  return {
    messageId: messageId,
    from: from,
    attachmentFilename: filename,
    rawText,
    html,
    attachmentId: attachmentId,
    subject
  };
};

// Get attachment of a message.
const extractAttachmentFromMessage = async (email, messageId, attachmentId) => {
  return gmail.users.messages.attachments.get({
    id: attachmentId,
    messageId: messageId,
    userId: email
  });
};


exports.watchGmailMessages = async (event) => {
  // Decode the incoming Gmail push notification.
  const data = Buffer.from(event.data, 'base64').toString();
  console.log(`hello email data is here -------- ${data}`);
  const newMessageNotification = JSON.parse(data);
  const email = newMessageNotification.emailAddress;
  const historyId = newMessageNotification.historyId;

  try {
    await auth.auth.requireAuth(null, null, email);
  } catch (err) {
    console.log('An error has occurred in the auth process.');
    throw err;
  }
  const authClient = await auth.auth.authedUser.getClient();
  google.options({auth: authClient});

  // Process the incoming message.
  const message = await getMostRecentMessageWithTag(email, historyId);
  if (message) {
    const messageInfo = extractInfoFromMessage(message);

    // check if the email is from a particular sender in our case its founders@dailycodingproblem
    if(messageInfo.from.includes('founders@dailycodingproblem.com')) {

      // Make a POST request to the compute engine with the message info. So that it can process the message, save it to disk , commit it to git and send it Github
      axios.post(COMPUTE_ENGINE_URL, messageInfo)
        .then(response => {
          console.log('Response from the compute engine:', response.data);
        })
        .catch(error => {
          console.error('Error:', error);
      });

    }
  }
};
