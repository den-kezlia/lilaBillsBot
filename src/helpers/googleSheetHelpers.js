const getUsersList = async (listsDoc) => {
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
};

let createNewBill = async (billsDoc, listsDoc, bill) => {
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

    const usersList = await getUsersList(listsDoc);
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

let payBill = async (billsDoc, listsDoc, id, sum) => {
    let userRow;
    const usersList = await getUsersList(listsDoc);
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

module.exports = {
    getUsersList: getUsersList,
    createNewBill: createNewBill,
    payBill: payBill
};