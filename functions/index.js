const functions = require("firebase-functions");

const admin = require('firebase-admin');

const serviceAccount = require('./admin/admin.json');

//quando o firebase se conectar pelo CLI vamos ter sucesso ao reconhecer o app
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

const dbRef =  admin.firestore().doc('tokens/demo');

const twitterApi = require('twitter-api-v2').default
const twitterClient = new twitterApi({
    clientId:'',
    clientSecret: ''
})

const callbackURL = 'http://127.0.0.1:5002/twitter-bot-nodejs/us-central1/callback';

// OpenAI API init
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
  organization: '',
  apiKey: 'sk-',
});
const openai = new OpenAIApi(configuration);



twitterClient.generateOAuth2AuthLink

exports.auth = functions.https.onRequest(async(request,response) => {
    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
        callbackURL,
        { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
      );
    await dbRef.set({codeVerifier, state});

    response.redirect(url);
});

exports.callback = functions.https.onRequest(async(request,response) => {
    const { state, code } = request.query;

    const dbSnapshot = await dbRef.get();
    const { codeVerifier, state: storedState } = dbSnapshot.data();
  
    if (state !== storedState) {
      return response.status(400).send('Stored tokens do not match!');
    }

    const {
        client: loggedClient,
        accessToken,
        refreshToken,
      } = await twitterClient.loginWithOAuth2({
        code,
        codeVerifier,
        redirectUri: callbackURL,
      });

    await dbRef.set({ accessToken, refreshToken });

    const { data } = await loggedClient.v2.me(); 

    response.send(data);

});

exports.tweet = functions.https.onRequest(async(request,response) => {
    const { refreshToken } = (await dbRef.get()).data();

    const {
      client: refreshedClient,
      accessToken,
      refreshToken: newRefreshToken,
    } = await twitterClient.refreshOAuth2Token(refreshToken);
  
    await dbRef.set({ accessToken, refreshToken: newRefreshToken });
  
    const nextTweet = await openai.createCompletion('text-davinci-001', {
      prompt: 'tweet something cool for #techtwitter',
      max_tokens: 64,
    });
  
    const { data } = await refreshedClient.v2.tweet(
      nextTweet.data.choices[0].text
    );
  
    response.send(data);
});