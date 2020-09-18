const TeleBot = require('telebot');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const credentials = require('./../config/lilabills-b15e8309c4d5.json');
const config = require('./../config/config.json');
const billsDoc = new GoogleSpreadsheet(config.googleSpreadsheet);
const listsDoc = new GoogleSpreadsheet(config.lists);

let loadSheets = async () => {
    await billsDoc.useServiceAccountAuth(credentials, 'lilabills@lilabills.iam.gserviceaccount.com');
    await listsDoc.useServiceAccountAuth(credentials, 'lilabills@lilabills.iam.gserviceaccount.com');
    await billsDoc.loadInfo();
    await listsDoc.loadInfo();
}
loadSheets();

let getSheetTitle = async () => {
    return billsDoc.title;
}

let getUsersList = async () => {
    const sheet = await listsDoc.sheetsByIndex[0];
    await sheet.loadCells();

    let users = [];
    let iterator = 0;
    while (true) {
        const name = sheet.getCell(iterator, 0).value;
        const id = sheet.getCell(iterator, 1).value;
        if (!name) {
            break;
        }
        iterator++;
        users.push({name: name, id: id});
    }

    return users;
}

let createNewBill = async (bill) => {
    const version = billsDoc.sheetCount + 1;
    const currentBillSheet = await billsDoc.sheetsByIndex[0];
    await currentBillSheet.loadCells();

    const newBillSheet = await billsDoc.addSheet({
        index: 0,
        title: `V${version} - ${bill.price} - ${bill.date}`
    });
    await newBillSheet.loadCells();

    const priceCell = newBillSheet.getCell(0, 0);
    const dateCell = newBillSheet.getCell(0, 1);
    const descriptionCell = newBillSheet.getCell(0, 2);
    const namesTitleCell = newBillSheet.getCell(1, 0);
    const balanceTitleCell = newBillSheet.getCell(1, 1);
    priceCell.value = bill.price;
    dateCell.value = bill.date;
    descriptionCell.value = bill.description;
    namesTitleCell.value = 'Имена';
    balanceTitleCell.value = 'Баланс';

    const usersList = await getUsersList();
    usersList.map((user, index) => {
        const i = index + 2;
        const userBalance = currentBillSheet.getCell(i, 1).value;
        const userNameCell = newBillSheet.getCell(i, 0);
        const userFormulaCell = newBillSheet.getCell(i, 1);
        const userBalanceCell = newBillSheet.getCell(i, 2);

        userNameCell.value = user.name;
        userFormulaCell.formula = `=SUM(C${i + 1}:Z${i + 1})-A1`;
        userBalanceCell.value = userBalance;
    });

    await newBillSheet.saveUpdatedCells();

    return;
}

let payBill = async (id, sum) => {
    const usersList = await getUsersList();
    let userRow;
    usersList.forEach((user, index) => {
        if (user.id === id) {
            userRow = index + 2;
        }
    });

    const currentBillSheet = await billsDoc.sheetsByIndex[0];
    await currentBillSheet.loadCells();

    if (userRow) {
        let iterator = 2;
        while (true) {
            const value = currentBillSheet.getCell(userRow, iterator).value;
            if (!value) {
                break;
            }
            iterator++;
        }

        const newBillCell = currentBillSheet.getCell(userRow, iterator);
        newBillCell.value = sum;
        await currentBillSheet.saveUpdatedCells();
    }

    return;
}

const bot = new TeleBot({
    token: config.telegramToken,
    usePlugins: ['askUser']
});

bot.on(['/start', '/back'], msg => {
    let replyMarkup = bot.keyboard([
        ['/buttons', '/inlineKeyboard'],
        ['/start', '/hide'],
        ['/payBill', '/createBill']
    ], {resize: true});

    try {
        getSheetTitle().then(message => {
            bot.sendMessage(msg.from.id, message);
        })
    } catch (error) {
        console.log(error);
    }

    bot.sendMessage(msg.from.id, 'Keyboard example.', {replyMarkup});

    return;
});

bot.on('/payBill', msg => {
    const id = msg.from.id;
    // Ask user name
    return bot.sendMessage(id, 'Сумма', {ask: 'payBill', replyMarkup: 'hide'});
});

// Ask name event
bot.on('ask.payBill', msg => {
    const id = msg.from.id;
    const userName = msg.from.username;
    const sum = Number(msg.text);

    try {
        payBill(userName, sum).then(() => {
            return bot.sendMessage(id, `Оплата зафиксирована`);
        })
    } catch (error) {
        console.log(error)
    }
});

bot.on('/createBill', msg => {
    const id = msg.from.id;
    // Ask user name
    return bot.sendMessage(id, 'Описание счета', {ask: 'description', replyMarkup: 'hide'});
});

// Ask name event
let description = '';
bot.on('ask.description', msg => {
    const id = msg.from.id;
    description = msg.text;

    // Ask user age
    return bot.sendMessage(id, `По сколько сдаем`, { ask: 'price' });
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
        createNewBill(bill).then(() => {
            return bot.sendMessage(id, `Счет добавлен`);
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