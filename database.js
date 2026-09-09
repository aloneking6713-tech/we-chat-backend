const fs = require("fs");

const file = "chat-data.json";

if (!fs.existsSync(file)) {
    fs.writeFileSync(
        file,
        JSON.stringify({
            users: [],
            messages: [],
            resetTokens: []
        }, null, 2)
    );
}

function load() {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function save(data) {
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2)
    );
}

function addUser(name, phone, email, password) {
    const data = load();

    const id = data.users.length + 1;

    data.users.push({
        id,
        name,
        phone,
        email,
        password,
        created_at: new Date().toISOString()
    });

    save(data);
    return id;
}

function findByAccount(account) {
    const data = load();

    return data.users.find(
        u => u.email === account || u.phone === account
    );
}

function findByEmail(email) {
    const data = load();

    return data.users.find(
        u => u.email === email
    );
}

function findByPhone(phone) {
    const data = load();

    return data.users.find(
        u => u.phone === phone
    );
}

function updatePassword(userId, password) {
    const data = load();

    const user = data.users.find(
        u => u.id === userId
    );

    if (!user) return false;

    user.password = password;

    save(data);
    return true;
}

function addMessage(room, userId, text) {
    const data = load();

    const message = {
        id: data.messages.length + 1,
        room,
        user_id: userId,
        text,
        created_at: new Date().toISOString()
    };

    data.messages.push(message);
    save(data);

    return message;
}

function getMessages(room) {
    const data = load();

    return data.messages.filter(
        m => m.room === room
    );
}

module.exports = {
    addUser,
    findByAccount,
    findByEmail,
    findByPhone,
    updatePassword,
    addMessage,
    getMessages
};
