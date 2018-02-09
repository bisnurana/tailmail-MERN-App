const mongoose = require('mongoose');
const sgMail = require('@sendgrid/mail');
const checkLogin = require('../middlewares/checkLogin');
const checkCredit = require('../middlewares/checkCredit');
const { SENDGRIDAPI_KEY } = require('../config/keys');
const Email = mongoose.model('email');
sgMail.setApiKey(SENDGRIDAPI_KEY);
function formatLink(inputText) {
    let replacedText, replacePattern1, replacePattern2, replacePattern3;
    //URLs starting with http://, https://, or ftp://
    replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
    replacedText = inputText.replace(replacePattern1, '<a href="$1" target="_blank">$1</a>');

    //URLs starting with "www." (without // before it, or it'd re-link the ones done above).
    replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
    replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2" target="_blank">$2</a>');

    //Change email addresses to mailto:: links.
    replacePattern3 = /(([a-zA-Z0-9\-\_\.])+@[a-zA-Z\_]+?(\.[a-zA-Z]{2,6})+)/gim;
    replacedText = replacedText.replace(replacePattern3, '<a href="mailto:$1">$1</a>');

    return replacedText;
}
module.exports = (app) => {
    app.post('/api/response', checkLogin, checkCredit, async (req, res) => {
        const { title, subject, body, recipients } = req.body;
        const newEmail = new Email({
            title, subject, body, recipients: recipients.split(',').map(email => ({ email: email.trim() })),
            dateSent: Date.now(),
            _user: req.user.id
        });
        const formattedRecipients = recipients.split(',').map(recipient => recipient.trim());
        const formattedBody = formatLink(body);
        const msg = {
            to: formattedRecipients,
            from: 'noreply@tailmail.com',
            subject: subject,
            html: `<p>${formattedBody}</p>`,
            customArgs: {
                emailID: newEmail.id,
            },
        };
        try {
            await sgMail.sendMultiple(msg);
            await newEmail.save();
            req.user.credits -= 1;
            const user = await req.user.save();
            res.send(user);
        } catch (error) {
            res.status(422).send(err);
        }


    })
    app.post('/api/response/sgwebhooks', (req, res) => {
        console.log(req.body);
        res.send({});
    })

}
