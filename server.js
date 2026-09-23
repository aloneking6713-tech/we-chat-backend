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

app.use(express.json({ limit: "10mb" }));

app.use(express.static("public"));
app.get("/download/", (req, res) => {
    res.sendFile(__dirname + "/public/download/index.html");
});
app.get("/search-users", (req, res) => {
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");
        const user = verify(token);
        const query = req.query.q;

        if (!query) {
            return res.json([]);
        }

        const users = db.searchUsers(query, user.id);
        res.json(users);

    } catch (error) {
        res.status(401).json({
            error: "Login expired"
        });
    }
});

// ================= REGISTER =================

app.post("/register", (req, res) => {

    try {

         const {
    username,
    name,
    phone,
    email,
    password
} = req.body;


           if (!username || !name || !phone || !email || !password) {
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
    username.trim().toLowerCase(),
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

        const user = verify(data.token);

        const targetId =
            Number(data.targetId);

        if (!targetId) {
            return;
        }

        const room =
            [user.id, targetId]
                .sort((a, b) => a - b)
                .join("_");

        socket.userId = user.id;
        socket.name = user.name;
        socket.room = room;

        socket.join(room);
console.log(
    "ROOM JOIN:",
    socket.userId,
    room
);

        const messages =
            db.getMessages(room);

        socket.emit(
            "oldMessages",
            messages
        );

    } catch (e) {

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
console.log(
    "SEND:",
    socket.userId,
    socket.room
);

io.to(socket.room).emit(
        "receiveMessage",
        message
    );

});
// ================= PHOTO MESSAGE =================

socket.on("sendPhoto", (photo) => {

    if (!socket.userId || !socket.room) {
        return;
    }

    if (!photo || !photo.trim()) {
        return;
    }

    const message = db.addMessage(
        socket.room,
        socket.userId,
        photo.trim(),
        "image"
    );

    socket.broadcast.to(
        socket.room
    ).emit(
        "receiveMessage",
        message
    );
});
});

// ================= SERVER =================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("We Chat server running on port " + PORT);
});

