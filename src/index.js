const TeleBot = require('telebot');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const GoogleSheetHelpers = require('./helpers/googleSheetHelpers');
const credentials = require('./../config/lilabills-b15e8309c4d5.json');
const config = require('./../config/config.json');
const Buttons = require('./helpers/buttons');
const AdminIds = require('./../config/adminIDs');

const billsDoc = new GoogleSpreadsheet(config.googleSpreadsheet);
const listsDoc = new GoogleSpreadsheet(config.lists);
GoogleSheetHelpers.loadSheets(billsDoc, listsDoc, credentials, config);

const isAdmin = (id) => {
    return AdminIds.indexOf(id.toString()) > -1;
}

const sendNewBillNotifications = async (bill) => {
    const usersList = await GoogleSheetHelpers.getUsersList(listsDoc);

    usersList.forEach(user => {
        if (user.id) {
            user.id.forEach(id => {
                GoogleSheetHelpers.getUserBalance(billsDoc, listsDoc, id).then(balance => {
                    bot.sendMessage(id, `Добавлена новая оплата: "${bill.description}"\nСдаем по: ${bill.price}\nВаш баланс: ${balance} ${balance >= 0 ? '🙂' : '🤨'}`).catch(error => {
                        console.log(`catch - ${error}`)
                    });

                }).catch(error => {
                    console.log(`here - ${error}`);
                })
            })
        }
    });

    return;
}

const bot = new TeleBot({
    token: config.telegramToken,
    usePlugins: ['askUser', 'namedButtons'],
    pluginConfig: {
        namedButtons: {
            buttons: Buttons
        }
    }
});



bot.on(['/start'], msg => {
    const id = msg.from.id;
    let buttons = [];
    const userButtons = [Buttons.payBill.label, Buttons.myBalance.label];
    const adminButtons = [Buttons.createBill.label, Buttons.showAllBalances.label];

    buttons.push(userButtons);

    if (isAdmin(id)) {
        buttons.push(adminButtons);
    }

    let replyMarkup = bot.keyboard(buttons, {resize: true});

    return bot.sendMessage(id, 'Выберите одну из команд', {replyMarkup});
});

bot.on('/payBill', msg => {
    const id = msg.from.id;
    return bot.sendMessage(id, 'Какую сумму вы потратили?', {ask: 'payBill', replyMarkup: 'hide'});
});

let sum = '';
bot.on('ask.payBill', msg => {
    const id = msg.from.id;
    sum = Number(msg.text);

    return bot.sendMessage(id, 'Опишите вашу трату:', {ask: 'payBillDescription', replyMarkup: 'hide'});
});

bot.on('ask.payBillDescription', msg => {
    const id = msg.from.id;
    const description = msg.text;

    GoogleSheetHelpers.payBill(billsDoc, listsDoc, id, sum, description).then(() => {
        GoogleSheetHelpers.getUserBalance(billsDoc, listsDoc, id).then(balance => {
            return bot.sendMessage(id, `Оплата '${sum}' зафиксирована 👍\nВаш баланс: ${balance} ${balance >= 0 ? '🙂' : '🤨'}`);
        }).catch(error => {
            console.log(error);
        })
    }).catch(error => {
        console.log(error);
    })
});

bot.on('/createBill', msg => {
    const id = msg.from.id;

    return bot.sendMessage(id, 'Описание нового счет:', {ask: 'description', replyMarkup: 'hide'});
});

let description = '';
bot.on('ask.description', msg => {
    const id = msg.from.id;
    description = msg.text;

    return bot.sendMessage(id, `По сколько сдаем?`, { ask: 'price' });
});

bot.on('ask.price', msg => {
    const id = msg.from.id;
    const price = Number(msg.text);
    const date = new Date();
    const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
    const bill = {
        date: formattedDate,
        description: description,
        price: price
    };

    GoogleSheetHelpers.createNewBill(billsDoc, listsDoc, bill).then(() => {
        sendNewBillNotifications(bill);
    }).then(() => {
        return bot.sendMessage(id, `Счет добавлен 👍`);
    })
});

bot.on('/showBalance', msg => {
    GoogleSheetHelpers.getUserBalance(billsDoc, listsDoc, msg.from.id).then(balance => {
        return bot.sendMessage(msg.from.id, `Баланс: ${balance} ${balance >= 0 ? '🙂' : '🤨'}`);
    });
});

bot.on('/showAllBalances', msg => {
    GoogleSheetHelpers.getAllBalances(billsDoc).then(allBalances => {
        const message = allBalances.map(item => {
            return `${item.name}: ${item.balance} ${item.balance >= 0 ? '🙂' : '🤨'}`;
        });

        return bot.sendMessage(msg.from.id, message.join('\n'));
    });
});

bot.connect();