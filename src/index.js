const TeleBot = require('telebot');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const GoogleSheetHelpers = require('./helpers/googleSheetHelpers');
const credentials = require('./../config/lilabills-b15e8309c4d5.json');
const config = require('./../config/config.json');

const billsDoc = new GoogleSpreadsheet(config.googleSpreadsheet);
const listsDoc = new GoogleSpreadsheet(config.lists);
GoogleSheetHelpers.loadSheets(billsDoc, listsDoc, credentials, config);

const BUTTONS = {
    payBill: {
        label: '💸 Внести оплату',
        command: '/payBill'
    },
    createBill: {
        label: '📝 Создать новый счет',
        command: '/createBill'
    }
};

const bot = new TeleBot({
    token: config.telegramToken,
    usePlugins: ['askUser', 'namedButtons'],
    pluginConfig: {
        namedButtons: {
            buttons: BUTTONS
        }
    }
});

bot.on(['/start', '/back'], msg => {
    let replyMarkup = bot.keyboard([
        [BUTTONS.payBill.label, BUTTONS.createBill.label]
    ], {resize: true});

    return bot.sendMessage(msg.from.id, 'Выберите одну из команд', {replyMarkup});
});

bot.on('/payBill', msg => {
    const id = msg.from.id;
    return bot.sendMessage(id, 'Какую сумму вы потратили?', {ask: 'payBill', replyMarkup: 'hide'});
});

let sum = '';
// Ask name event
bot.on('ask.payBill', msg => {
    const id = msg.from.id;
    sum = Number(msg.text);

    return bot.sendMessage(id, 'Опишите вашу трату:', {ask: 'payBillDescription', replyMarkup: 'hide'});
});

// Ask name event
bot.on('ask.payBillDescription', msg => {
    const id = msg.from.id;
    const userName = msg.from.username;
    const description = msg.text;

    try {
        GoogleSheetHelpers.payBill(billsDoc, listsDoc, userName, sum, description).then(() => {
            return bot.sendMessage(id, `Оплата зафиксирована 👍`);
        })
    } catch (error) {
        console.log(error)
    }
});

bot.on('/createBill', msg => {
    const id = msg.from.id;
    // Ask user name
    return bot.sendMessage(id, 'Описание нового счет:', {ask: 'description', replyMarkup: 'hide'});
});

// Ask name event
let description = '';
bot.on('ask.description', msg => {
    const id = msg.from.id;
    description = msg.text;

    // Ask user age
    return bot.sendMessage(id, `По сколько сдаем?`, { ask: 'price' });
});

// Ask name event
bot.on('ask.price', msg => {
    const id = msg.from.id;
    const price = Number(msg.text);
    const date = new Date();
    const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
    const bill = {
        id: 0003,
        date: formattedDate,
        description: description,
        price: price,
        currency: 'UAH',
        status: 'unpaid'
    };

    try {
        GoogleSheetHelpers.createNewBill(billsDoc, listsDoc, bill).then(() => {
            return bot.sendMessage(id, `Счет добавлен 👍`);
        })
    } catch (error) {
        console.log(error)
    }
});

// Buttons
bot.on('/buttons', msg => {
    let replyMarkup = bot.keyboard([
        [bot.button('contact', 'Your contact'), bot.button('location', 'Your location')],
        ['/back', '/hide']
    ], {resize: true});

    return bot.sendMessage(msg.from.id, 'Button example.', {replyMarkup});
});

// Hide keyboard
bot.on('/hide', msg => {
    return bot.sendMessage(
        msg.from.id, 'Hide keyboard example. Type /back to show.', {replyMarkup: 'hide'}
    );
});

// On location on contact message
bot.on(['location', 'contact'], (msg, self) => {
    return bot.sendMessage(msg.from.id, `Thank you for ${ self.type }.`);
});

// Inline buttons
bot.on('/inlineKeyboard', msg => {

    let replyMarkup = bot.inlineKeyboard([
        [
            bot.inlineButton('callback', {callback: 'this_is_data'}),
            bot.inlineButton('inline', {inline: 'some query'})
        ], [
            bot.inlineButton('url', {url: 'https://telegram.org'})
        ]
    ]);

    return bot.sendMessage(msg.from.id, 'Inline keyboard example.', {replyMarkup});

});

// Inline button callback
bot.on('callbackQuery', msg => {
    // User message alert
    return bot.answerCallbackQuery(msg.id, `Inline button callback: ${ msg.data }`, true);
});

// Inline query
bot.on('inlineQuery', msg => {

    const query = msg.query;
    const answers = bot.answerList(msg.id);

    answers.addArticle({
        id: 'query',
        title: 'Inline Query',
        description: `Your query: ${ query }`,
        message_text: 'Click!'
    });

    return bot.answerQuery(answers);

});
bot.connect();