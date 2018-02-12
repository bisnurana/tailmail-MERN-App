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

    //handle spacing and line breaks
    replacedText = replacedText.replace('\n', '<br/>')
    return replacedText;
}
module.exports = (app) => {
    app.post('/api/response', checkLogin, checkCredit, async (req, res) => {
        const { title, subject, body, recipients } = req.body;
        const formattedRecipients = recipients.split(',').map(recipient => recipient.trim().toLowerCase());
        const formattedBody = formatLink(body);
        const newEmail = new Email({
            title, subject, body, recipients: recipients.split(',').map(email => ({ email: email.trim().toLowerCase() })),
            recipientsCount: formattedRecipients.length,
            dateSent: Date.now(),
            _user: req.user.id
        });
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
        console.log(req.body[0]);
        const { event, email, emailID, url = null } = req.body[0];
        console.log("url", url);
        console.log('event', event);
        console.log('email', email);
        console.log('emailID', emailID);
        if (event === 'open') {
            Email.updateOne({
                _id: emailID,
                recipients: {
                    $elemMatch: { email: email, open: false }
                }
            }
                , {
                    $inc: { open: 1 },
                    $set: { 'recipients.$.open': true, 'recipients.$.lastActive': Date.now() }

                }
            ).exec().then(result => console.log(result));
        } else {
            Email.updateOne({
                _id: emailID,
                recipients: {
                    $elemMatch: { email: email, click: false }
                }
            }
                , {
                    $inc: { click: 1 },
                    $set: { 'recipients.$.click': true, 'recipients.$.lastActive': Date.now() },
                    $addToSet: { 'recipients.$.urls': url }

                }
            ).exec().then(result => console.log(result));

        }
        res.status(200).send({});
    })
    app.get('/api/emails/reports', checkLogin, async (req, res) => {
        const reports = await Email.find({ _user: req.user.id });
        res.status(200).send(reports);
        console.log('/api/emails/reports route called');
    })
    app.get('/api/emails', checkLogin, async (req, res) => {
        const emails = await Email.find({ _user: req.user.id }).select({ recipients: false });
        res.status(200).send(emails);
        console.log('/api/emails route called');
    })
}