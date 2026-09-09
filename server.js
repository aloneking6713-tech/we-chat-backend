const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");

const db = require("./database");
const {
    register,
    login,
    verify,
    hashPassword
} = require("./auth");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));


// ================= REGISTER =================

app.post("/register", (req, res) => {

    try {

        const {
            name,
            phone,
            email,
            password
        } = req.body;

        if (!name || !phone || !email || !password) {
            return res.status(400).json({
                error: "Sabhi details enter karo"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: "Password kam se kam 6 characters ka ho"
            });
        }

        const token = register(
            name.trim(),
            phone.trim(),
            email.trim().toLowerCase(),
            password
        );

        res.json({
            success: true,
            token
        });

    } catch (error) {

        res.status(400).json({
            error: error.message
        });

    }
});


// ================= LOGIN =================

app.post("/login", (req, res) => {

    try {

        const {
            account,
            password
        } = req.body;

        if (!account || !password) {
            return res.status(400).json({
                error: "Email/Phone aur Password enter karo"
            });
        }

        const token =
            login(
                account.trim(),
                password
            );

        res.json({
            success: true,
            token
        });

    } catch (error) {

        res.status(401).json({
            error: error.message
        });

    }
});


// ================= FORGOT PASSWORD =================

// OTP request
app.post("/forgot-password", (req, res) => {

    const { account } = req.body;

    if (!account) {
        return res.status(400).json({
            error: "Email ya Phone enter karo"
        });
    }

    const user =
        db.findByAccount(account.trim());

    if (!user) {
        return res.status(404).json({
            error: "Account nahi mila"
        });
    }

    /*
       Yahan REAL OTP provider connect hoga.

       OTP ko SMS/email provider se bhejna hoga.
       OTP ko response me nahi bhejna hai.
    */

    const otp =
        crypto.randomInt(100000, 1000000).toString();

    console.log(
        "OTP generated for:",
        user.email
    );

    // Temporary server memory
    global.resetOTP = {
        userId: user.id,
        otp: otp,
        expires: Date.now() + 5 * 60 * 1000
    };

    res.json({
        success: true,
        message: "OTP request accepted"
    });
});


// ================= VERIFY OTP =================

app.post("/verify-otp", (req, res) => {

    const { otp } = req.body;

    if (!global.resetOTP) {
        return res.status(400).json({
            error: "OTP request nahi mila"
        });
    }

    if (
        Date.now() >
        global.resetOTP.expires
    ) {
        global.resetOTP = null;

        return res.status(400).json({
            error: "OTP expire ho gaya"
        });
    }

    if (
        otp !== global.resetOTP.otp
    ) {
        return res.status(400).json({
            error: "Invalid OTP"
        });
    }

    res.json({
        success: true,
        resetToken:
            crypto.randomBytes(32).toString("hex")
    });
});


// ================= RESET PASSWORD =================

app.post("/reset-password", (req, res) => {

    const {
        resetToken,
        password
    } = req.body;

    if (!resetToken || !password) {
        return res.status(400).json({
            error: "Details incomplete hain"
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            error: "Password kam se kam 6 characters ka ho"
        });
    }

    /*
       Production version me resetToken
       server-side securely store/verify hoga.
    */

    if (!global.resetOTP) {
        return res.status(400).json({
            error: "Reset session expire ho gayi"
        });
    }

    const hash =
        hashPassword(password);

    const changed =
        db.updatePassword(
            global.resetOTP.userId,
            hash
        );

    if (!changed) {
        return res.status(400).json({
            error: "Password update nahi hua"
        });
    }

    global.resetOTP = null;

    res.json({
        success: true,
        message: "Password successfully changed"
    });
});


// ================= REAL-TIME CHAT =================

io.on("connection", (socket) => {

    console.log(
        "User connected:",
        socket.id
    );

    socket.on("joinRoom", (data) => {

        try {

            const user =
                verify(data.token);

            if (!data.room) {
                return;
            }

            socket.userId = user.id;
            socket.name = user.name;
            socket.room = data.room;

            socket.join(data.room);

            const messages =
                db.getMessages(data.room);

            socket.emit(
                "oldMessages",
                messages
            );

        } catch {

            socket.emit(
                "authError",
                "Login expired"
            );
        }
    });


    socket.on("sendMessage", (text) => {

        if (
            !socket.userId ||
            !socket.room
        ) {
            return;
        }

        if (
            !text ||
            !text.trim()
        ) {
            return;
        }

        const message =
            db.addMessage(
                socket.room,
                socket.userId,
                text.trim()
            );

        io.to(socket.room).emit(
            "receiveMessage",
            message
        );
    });


    socket.on("disconnect", () => {

        console.log(
            "User disconnected:",
            socket.id
        );

    });

});


// ================= SERVER =================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("We Chat server running on port " + PORT);
});

