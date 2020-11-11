const config = require('../../config/config.json');

let loadSheets = async (billsDoc, listsDoc, credentials, config) => {
    await billsDoc.useServiceAccountAuth(credentials, config.googleEmail);
    await listsDoc.useServiceAccountAuth(credentials, config.googleEmail);
    await billsDoc.loadInfo();
    await listsDoc.loadInfo();
}

const getUsersList = async (listsDoc) => {
    const sheet = await listsDoc.sheetsByIndex[0];
    await sheet.loadCells();

    let users = [];
    let iterator = 0;
    while (true) {
        const name = sheet.getCell(iterator, 0).value;
        const id = sheet.getCell(iterator, 1).value;
        if (!name || !id) {
            break;
        }
        iterator++;
        users.push({name: name, id: id.toString().split('|')});
    }

    return users;
};

let createNewBill = async (billsDoc, listsDoc, bill) => {
    const version = billsDoc.sheetCount + 1;
    const currentBillSheet = await billsDoc.sheetsByIndex[0];
    await currentBillSheet.loadCells();

    const newBillSheet = await billsDoc.addSheet({
        index: 0,
        title: `V${version} | ${bill.price} | ${bill.date} | Random${(Math.random()*1000).toFixed()}`
    });
    await newBillSheet.loadCells();

    const priceCell = newBillSheet.getCell(0, 0);
    const dateCell = newBillSheet.getCell(0, 1);
    const descriptionCell = newBillSheet.getCell(0, 2);
    const namesTitleCell = newBillSheet.getCell(1, 0);
    const balanceTitleCell = newBillSheet.getCell(1, 1);
    const prevBalanceTitleCell = newBillSheet.getCell(1, 2);
    priceCell.value = bill.price;
    dateCell.value = bill.date;
    descriptionCell.value = bill.description;
    namesTitleCell.value = 'Имена:';
    balanceTitleCell.value = 'Баланс:';
    prevBalanceTitleCell.value = 'Баланс с прошлой сдачи:';

    const usersList = await getUsersList(listsDoc);
    if (usersList) {
        usersList.forEach((user, index) => {
            const i = index * 2 + 2;
            const userBalance = currentBillSheet.getCell(i, 1).value;
            const userNameCell = newBillSheet.getCell(i, 0);
            const userFormulaCell = newBillSheet.getCell(i, 1);
            const userBalanceCell = newBillSheet.getCell(i, 2);
            const combinedUsersCount = user.id.length;

            userNameCell.value = user.name;
            userFormulaCell.formula = `=SUM(C${i + 1}:Z${i + 1})-A1*${combinedUsersCount}`;
            userBalanceCell.value = userBalance;
        });

        await newBillSheet.saveUpdatedCells();
    }

    return;
}

let payBill = async (billsDoc, listsDoc, id, sum, description) => {
    let userRow;
    const usersList = await getUsersList(listsDoc);

    if (usersList) {
        usersList.forEach((user, index) => {
            if (user.id.indexOf(id.toString()) > -1) {
                userRow = index * 2 + 2;
            }
        });

        if (userRow) {
            let iterator = 2;
            const currentBillSheet = await billsDoc.sheetsByIndex[0];
            await currentBillSheet.loadCells();

            while (true) {
                const value = currentBillSheet.getCell(userRow, iterator).value;
                if (!value) {
                    break;
                }
                iterator++;
            }

            const date = new Date();
            const formattedDate = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
            const newBillCell = currentBillSheet.getCell(userRow, iterator);
            const newBillDescriptionCell = currentBillSheet.getCell(userRow + 1, iterator);
            newBillCell.value = sum;
            newBillDescriptionCell.value = `${formattedDate} | ${description}`;

            await currentBillSheet.saveUpdatedCells();
        }
    }

    return;
}

const getUserBalance = async (billsDoc, listsDoc, id) => {
    let userRow;
    let balance;
    const usersList = await getUsersList(listsDoc);
    usersList.forEach((user, index) => {
        if (user.id.indexOf(id.toString()) > -1) {
            userRow = index * 2 + 2;
        }
    });

    if (userRow) {
        const currentBillSheet = await billsDoc.sheetsByIndex[0];
        await currentBillSheet.loadCells();
        balance = currentBillSheet.getCell(userRow, 1).value;
    }

    return balance;
}

const getAllBalances = async (billsDoc) => {
    let iterator = 2;
    let allBalances = []
    const currentBillSheet = await billsDoc.sheetsByIndex[0];
    await currentBillSheet.loadCells();

    while (true) {
        const name = currentBillSheet.getCell(iterator, 0).value;
        if (name) {
            const balance = currentBillSheet.getCell(iterator, 1).value;
            allBalances.push({name: name, balance: balance});

            iterator = iterator + 2;
        } else {
            break;
        }
    }

    return allBalances;
}

const getLatestRecipes = async (billsDoc, listsDoc, id) => {
    let userRow;
    let recipes = [];
    let listIndex = 0;
    let iterator = 3;
    const usersList = await getUsersList(listsDoc);
    usersList.forEach((user, index) => {
        if (user.id.indexOf(id.toString()) > -1) {
            userRow = index * 2 + 2;
        }
    });

    if (userRow) {
        let currentBillSheet = await billsDoc.sheetsByIndex[listIndex];
        await currentBillSheet.loadCells();

        while (true) {
            const amount = currentBillSheet.getCell(userRow, iterator).value;

            if (amount) {
                recipes.push({
                    amount: currentBillSheet.getCell(userRow, iterator).value,
                    description: currentBillSheet.getCell(userRow + 1, iterator).value
                });

                iterator = iterator + 1;
            } else if (recipes.length < 10 && listIndex + 1 < billsDoc.sheetsByIndex.length) {
                iterator = 3;
                listIndex = listIndex + 1;
                currentBillSheet = await billsDoc.sheetsByIndex[listIndex];
                await currentBillSheet.loadCells();
            } else {
                break;
            }
        }
    }

    return recipes;
}

const isUserInList = async (listsDoc, id) => {
    let isUserInList = false;
    const usersList = await getUsersList(listsDoc);

    usersList.forEach(user => {
        if (user.id.indexOf(id.toString()) > -1) {
            isUserInList = true;
        }
    });

    return isUserInList;
}

const getAllLatestRecipes = async (billsDoc) => {
    let userRow = 2;
    let allLatestRecipes = []
    let listIndex = 0;
    let currentBillSheet = await billsDoc.sheetsByIndex[listIndex];
    await currentBillSheet.loadCells();

    while (true) {
        const name = currentBillSheet.getCell(userRow, 0).value;

        if (name) {
            let iterator = 3;
            let recipes = [];

            while (true) {
                const amount = currentBillSheet.getCell(userRow, iterator).value;

                if (amount) {
                    recipes.push({
                        amount: amount,
                        description: currentBillSheet.getCell(userRow + 1, iterator).value
                    });

                    iterator = iterator + 1;
                } else if (recipes.length < 10 && listIndex + 1 < billsDoc.sheetsByIndex.length) {
                    listIndex = listIndex + 1;
                    currentBillSheet = await billsDoc.sheetsByIndex[listIndex];
                    await currentBillSheet.loadCells();
                    iterator = 3;
                } else {
                    break;
                }
            }

            allLatestRecipes.push({
                name: name,
                recipes: recipes
            })

            userRow = userRow + 2;
        } else {
            break;
        }
    }

    return allLatestRecipes;
}

const getBillsSheetUrl = () => {
    return `[Excel Link](https://docs.google.com/spreadsheets/d/${config.billsGoogleSheetID}/)`;
}

module.exports = {
    getUsersList: getUsersList,
    createNewBill: createNewBill,
    payBill: payBill,
    loadSheets: loadSheets,
    getUserBalance: getUserBalance,
    getAllBalances: getAllBalances,
    isUserInList: isUserInList,
    getLatestRecipes: getLatestRecipes,
    getAllLatestRecipes: getAllLatestRecipes,
    getBillsSheetUrl: getBillsSheetUrl
};