const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./database");

const SECRET =
    process.env.JWT_SECRET ||
    "CHANGE_THIS_SECRET_LATER";

function register(name, phone, email, password) {

    if (db.findByPhone(phone)) {
        throw new Error("Phone already registered");
    }

    if (db.findByEmail(email)) {
        throw new Error("Email already registered");
    }

    const hash =
        bcrypt.hashSync(password, 10);

    const id = db.addUser(
        name,
        phone,
        email,
        hash
    );

    return jwt.sign(
        {
            id,
            name,
            phone,
            email
        },
        SECRET,
        {
            expiresIn: "7d"
        }
    );
}

function login(account, password) {

    const user =
        db.findByAccount(account);

    if (!user) {
        throw new Error(
            "Invalid email/phone or password"
        );
    }

    const correct =
        bcrypt.compareSync(
            password,
            user.password
        );

    if (!correct) {
        throw new Error(
            "Invalid email/phone or password"
        );
    }

    return jwt.sign(
        {
            id: user.id,
            name: user.name,
            phone: user.phone,
            email: user.email
        },
        SECRET,
        {
            expiresIn: "7d"
        }
    );
}

function verify(token) {
    return jwt.verify(token, SECRET);
}

function hashPassword(password) {
    return bcrypt.hashSync(password, 10);
}

module.exports = {
    register,
    login,
    verify,
    hashPassword
};
