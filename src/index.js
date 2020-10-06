const TeleBot = require('telebot');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const GoogleSheetHelpers = require('./helpers/googleSheetHelpers');
const credentials = require('./../config/lilabills-b15e8309c4d5.json');
const config = require('./../config/config.json');
const Buttons = require('./helpers/buttons');
const AdminIds = require('./../config/adminIDs');
const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'lila-bills-bot' },
    transports: [
      new winston.transports.File({ filename: path.join(__dirname, '/logs/error.log'), level: 'error' }),
      new winston.transports.File({ filename: path.join(__dirname, '/logs/combined.log') }),
    ],
});

const billsDoc = new GoogleSpreadsheet(config.googleSpreadsheet);
const listsDoc = new GoogleSpreadsheet(config.lists);
GoogleSheetHelpers.loadSheets(billsDoc, listsDoc, credentials, config).catch(error => {
    logger.error(new Error(error.stack));
});
let answers = {};

const isAdmin = (id) => {
    return AdminIds.indexOf(id.toString()) > -1;
}

const sendNewBillNotifications = async (bill) => {
    const usersList = await GoogleSheetHelpers.getUsersList(listsDoc);

    usersList.forEach(user => {
        if (user.id) {
            user.id.forEach(id => {
                GoogleSheetHelpers
                    .getUserBalance(billsDoc, listsDoc, id)
                    .then(balance => {
                        bot.sendMessage(id, `Добавлена новая оплата: "${bill.description}"\nСдаем по: ${bill.price}\nВаш баланс: ${balance} ${balance >= 0 ? '🙂' : '🤨'}`)
                        .catch(error => {
                            logger.error(new Error(`error code - ${error.error_code}. ${error.description}. In sendNewBillNotifications method`));
                        });
                }).catch(error => {
                    logger.error(new Error(error.stack));
                })
            })
        }
    });

    return;
}

const generateStartButtons = (id) => {
    let buttons = [];
    const userButtons = [Buttons.payBill.label, Buttons.myBalance.label];
    const adminButtons = [Buttons.createBill.label, Buttons.showAllBalances.label];

    buttons.push(userButtons);

    if (isAdmin(id)) {
        buttons.push(adminButtons);
    }

    return buttons;
}

const sendBlockedMessage = (id) => {
    logger.warn(`We do not know him. id - ${id}`);

    return bot.sendMessage(id, 'Тестовый бот', {replyMarkup: 'hide'});
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

    logger.log('info', 'Start', msg.from);

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {
            const buttons = generateStartButtons(id);
            const replyMarkup = bot.keyboard(buttons, {resize: true});

            return bot.sendMessage(id, 'Выберите одну из команд', {replyMarkup});
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});


// PAY BILL //
bot.on('/payBill', msg => {
    const id = msg.from.id;

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {
            return bot.sendMessage(id, 'Какую сумму вы потратили?', {ask: 'payBill', replyMarkup: 'hide'});
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});

bot.on('ask.payBill', msg => {
    const id = msg.from.id;

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {
            const sum = Number(msg.text);

            if (isNaN(sum)) {
                return bot.sendMessage(id, 'Вы ввели неверный формат суммы. Используйте только цифры, не используйте точки или запятые', {ask: 'payBill', replyMarkup: 'hide'});
            } else {
                answers[id] = {};
                answers[id].sum = sum;
                return bot.sendMessage(id, 'Опишите вашу трату:', {ask: 'payBillDescription', replyMarkup: 'hide'});
            }
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});

bot.on('ask.payBillDescription', msg => {
    const id = msg.from.id;
    const description = msg.text;

    logger.log('info', 'payBill', {
        id: id,
        sum: answers[id].sum,
        description: description
    });

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {
            const buttons = generateStartButtons(id);
            const replyMarkup = bot.keyboard(buttons, {resize: true});

            GoogleSheetHelpers.payBill(billsDoc, listsDoc, id, answers[id].sum, description).then(() => {
                GoogleSheetHelpers.getUserBalance(billsDoc, listsDoc, id).then(balance => {
                    return bot.sendMessage(id, `Оплата '${answers[id].sum}' зафиксирована 👍\nВаш баланс: ${balance} ${balance >= 0 ? '🙂' : '🤨'}`, {replyMarkup});
                }).catch(error => {
                    logger.error(new Error(error.stack));
                })
            }).catch(error => {
                logger.error(new Error(error.stack));
            })
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});
// PAY BILL //


// CREATE BILL //
bot.on('/createBill', msg => {
    const id = msg.from.id;

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList && isAdmin(id)) {
            return bot.sendMessage(id, 'Описание нового счет:', {ask: 'description', replyMarkup: 'hide'});
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});

bot.on('ask.description', msg => {
    const id = msg.from.id;

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList && isAdmin(id)) {
            answers[id] = {};
            answers[id].description = msg.text;
            return bot.sendMessage(id, `По сколько сдаем?`, { ask: 'price' });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});

bot.on('ask.price', msg => {
    const id = msg.from.id;
    const price = Number(msg.text);
    const date = new Date();
    const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
    const bill = {
        date: formattedDate,
        description: answers[id].description,
        price: price
    };

    logger.log('info', 'createBill', {
        id: id,
        price: price,
        description: answers[id].description,
        date: formattedDate
    });

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList && isAdmin(id)) {

            if (isNaN(price)) {
                return bot.sendMessage(id, 'Вы ввели неверный формат суммы. Используйте только цифры, не используйте точки или запятые', {ask: 'price', replyMarkup: 'hide'});
            }

            const buttons = generateStartButtons(id);
            const replyMarkup = bot.keyboard(buttons, {resize: true});

            GoogleSheetHelpers.createNewBill(billsDoc, listsDoc, bill).then(() => {
                sendNewBillNotifications(bill);
            }).then(() => {
                return bot.sendMessage(id, `Счет добавлен 👍`, {replyMarkup});
            }).catch(error => {
                logger.error(new Error(error.stack));
            });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});
// CREATE BILL //


// SHOW BALANCE //
bot.on('/showBalance', msg => {
    const id = msg.from.id;

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {
            const buttons = generateStartButtons(id);
            const replyMarkup = bot.keyboard(buttons, {resize: true});

            GoogleSheetHelpers.getUserBalance(billsDoc, listsDoc, id)
                .then(balance => {
                    return bot.sendMessage(id, `Баланс: ${balance} ${balance >= 0 ? '🙂' : '🤨'}`, {replyMarkup});
                })
                .catch(error => {
                    logger.error(new Error(error.stack));
                });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});
// SHOW BALANCE //


// SHOW ALL BALANCEs //
bot.on('/showAllBalances', msg => {
    const id = msg.from.id;

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList && isAdmin(id)) {
            const buttons = generateStartButtons(id);
            const replyMarkup = bot.keyboard(buttons, {resize: true});

            GoogleSheetHelpers.getAllBalances(billsDoc).then(allBalances => {
                const message = allBalances.map(item => {
                    return `${item.name}: ${item.balance} ${item.balance >= 0 ? '🙂' : '🤨'}`;
                });

                return bot.sendMessage(id, message.join('\n'), {replyMarkup});
            }).catch(error => {
                logger.error(new Error(error.stack));
            });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.error(new Error(error.stack));
    });
});
// SHOW ALL BALANCEs //


bot.connect();