const TeleBot = require('telebot');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const GoogleSheetHelpers = require('./helpers/googleSheetHelpers');
const credentials = require('./../config/privateKey.json');
const config = require('./../config/config.json');
const Buttons = require('./helpers/buttons');
const AdminIds = require('../config/adminIDs');
const winston = require('winston');
const path = require('path');
const { log } = require('console');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'lila-bills-bot' },
    transports: [
      new winston.transports.File({ filename: path.join(__dirname, '../logs/error.log'), level: 'error' }),
      new winston.transports.File({ filename: path.join(__dirname, '../logs/combined.log') }),
    ],
});

const billsDoc = new GoogleSpreadsheet(config.billsGoogleSheetID);
const listsDoc = new GoogleSpreadsheet(config.listGoogleSheetID);
GoogleSheetHelpers.loadSheets(billsDoc, listsDoc, credentials, config).catch(error => {
    logger.log('error', error.description);
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
                    logger.log('error', error.description);
                })
            })
        }
    });

    return;
}

const getStartButtons = (id) => {
    let buttons = [];
    const userButtonsTopLine = [Buttons.myBalance.label, Buttons.payBill.label];
    const userButtonsSecondLine = [Buttons.showLatestRecipes.label];
    const adminButtonsTopLine = [Buttons.createBill.label, Buttons.showAllBalances.label];
    const adminButtonsSecondLine = Buttons.showAllLatestRecipes.label;

    if (isAdmin(id)) {
        userButtonsSecondLine.push(adminButtonsSecondLine);
        buttons.push(adminButtonsTopLine);
    }

    buttons.push(userButtonsTopLine);
    buttons.push(userButtonsSecondLine);

    return buttons;
}

const getReplyOptions = (id) => {
    const buttons = getStartButtons(id);

    return {
        replyMarkup: bot.keyboard(buttons, {resize: true}),
        parseMode: 'markdown'
    }
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
    const date = new Date();
    const message = `Start ${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;

    logger.log('info', message, msg.from);

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {
            const buttons = getStartButtons(id);
            const replyMarkup = bot.keyboard(buttons, {resize: true});

            return bot.sendMessage(id, 'Выберите одну из команд', {replyMarkup});
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
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
        logger.log('error', error.description);
    });
});

bot.on('ask.payBill', msg => {
    const id = msg.from.id;

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {
            const sum = Number(msg.text.replace(',', '.'));

            if (isNaN(sum)) {
                return bot.sendMessage(id, 'Вы ввели неверный формат суммы.', {ask: 'payBill', replyMarkup: 'hide'});
            } else {
                answers[id] = {};
                answers[id].sum = sum;
                return bot.sendMessage(id, 'Опишите вашу трату:', {ask: 'payBillDescription', replyMarkup: 'hide'});
            }
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
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
            const replyOptions = getReplyOptions(id);

            GoogleSheetHelpers.payBill(billsDoc, listsDoc, id, answers[id].sum, description).then(() => {
                GoogleSheetHelpers.getUserBalance(billsDoc, listsDoc, id).then(balance => {
                    return bot.sendMessage(id, `Оплата '${answers[id].sum}' зафиксирована 👍\nВаш баланс: ${balance} ${balance >= 0 ? '🙂' : '🤨'}`, replyOptions);
                }).catch(error => {
                    logger.log('error', error.description);
                })
            }).catch(error => {
                logger.log('error', error.description);
            })
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
    });
});
// PAY BILL //


// CREATE BILL //
bot.on('/createBill', msg => {
    const id = msg.from.id;

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList && isAdmin(id)) {
            return bot.sendMessage(id, 'Описание нового счета:', {ask: 'description', replyMarkup: 'hide'});
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
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
        logger.log('error', error.description);
    });
});

bot.on('ask.price', msg => {
    const id = msg.from.id;
    const price = Number(msg.text.replace(',', '.'));
    const date = new Date();
    const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
    const replyOptions = getReplyOptions(id);
    const bill = {
        date: formattedDate,
        description: answers[id].description,
        price: price
    };
    const billsLink = GoogleSheetHelpers.getBillsSheetUrl();

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

            GoogleSheetHelpers.createNewBill(billsDoc, listsDoc, bill).then(() => {
                sendNewBillNotifications(bill);
            }).then(() => {
                bot.sendMessage(id, `Счет добавлен 👍 \n${billsLink}`, replyOptions);

                return
            }).catch(error => {
                logger.log('error', error.description);
            });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
    });
});
// CREATE BILL //


// SHOW BALANCE //
bot.on('/showBalance', msg => {
    const id = msg.from.id;
    const replyOptions = getReplyOptions(id);

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {

            GoogleSheetHelpers.getUserBalance(billsDoc, listsDoc, id)
                .then(balance => {
                    return bot.sendMessage(id, `Баланс: ${balance} ${balance >= 0 ? '🙂' : '🤨'}`, replyOptions);
                })
                .catch(error => {
                    logger.log('error', error.description);
                });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
    });
});
// SHOW BALANCE //


// SHOW ALL BALANCES //
bot.on('/showAllBalances', msg => {
    const id = msg.from.id;
    const replyOptions = getReplyOptions(id);
    const billsLink = GoogleSheetHelpers.getBillsSheetUrl();

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList && isAdmin(id)) {
            GoogleSheetHelpers.getAllBalances(billsDoc).then(allBalances => {
                const message = allBalances.map(item => {
                    return `*${item.name}:* ${item.balance}грн ${item.balance >= 0 ? '🙂' : '🤨'}`;
                }).join('\n');

                return bot.sendMessage(id, `${message} \n${billsLink}`, replyOptions);
            }).catch(error => {
                logger.log('error', error.description);
            });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
    });
});
// SHOW ALL BALANCES //


// SHOW LATEST RECIPES //
bot.on('/showLatestRecipes', msg => {
    const id = msg.from.id;
    const replyOptions = getReplyOptions(id);

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {

            GoogleSheetHelpers.getLatestRecipes(billsDoc, listsDoc, id).then(latestRecipes => {
                let message;

                if (latestRecipes.length > 0) {
                    message = latestRecipes.map(item => {
                        return `${item.description} - *${item.amount}грн*`;
                    });
                    message = message.join('\n');
                } else {
                    message = 'Вы еще не вводили никаких оплат с последней сдачи денег';
                }

                bot.sendMessage(id, message, replyOptions);

                return
            }).catch(error => {
                logger.log('error', error.description);
            });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
    });
});
// SHOW LATEST RECIPES //


// SHOW ALL LATEST RECIPES //
bot.on('/showAllLatestRecipes', msg => {
    const id = msg.from.id;
    const replyOptions = getReplyOptions(id);
    const billsLink = GoogleSheetHelpers.getBillsSheetUrl();

    GoogleSheetHelpers.isUserInList(listsDoc, id).then(isUserInList => {
        if (isUserInList) {
            GoogleSheetHelpers.getAllLatestRecipes(billsDoc).then(latestRecipes => {
                let message = '';

                if (latestRecipes.length > 0) {
                    message = latestRecipes.map(item => {
                        return `*${item.name}:*\n ${item.recipes.map(recipe => {
                            return `${recipe.description} - *${recipe.amount}грн*`;
                        }).join('\n')}\n`;
                    }).join('\n');
                }

                return bot.sendMessage(id, `${message}${billsLink}`, replyOptions);
            }).catch(error => {
                logger.log('error', error.description);
            });
        } else {
            sendBlockedMessage(id);
        }
    }).catch(error => {
        logger.log('error', error.description);
    });
});
// SHOW ALL LATEST RECIPES //


bot.connect();