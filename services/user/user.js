require('dotenv').config();
const User = require('./models/User'); // Import model User để tương tác với MongoDB Atlas
const bcrypt = require('bcryptjs'); // Thư viện để băm mật khẩu
const express = require('express');
const mongoose = require('mongoose');

// Khởi tạo Web Server
const app = express();
app.use(express.json()); // Cho phép server đọc dữ liệu JSON gửi lên

// Khởi tạo kết nối Vault
const vault = require('node-vault')({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
  token: process.env.VAULT_TOKEN
});

// Hàm khởi động toàn bộ hệ thống
async function startServer() {
  try {
    console.log("Connect to Vault to retrieve Database...");
    let mongoURI;
    try {
      const vaultRes = await vault.read('secret/data/mongodb-credentials');
      mongoURI = vaultRes.data.data.MONGODB_URI;
    }
    catch (vaultError) {
      console.warn("Unable to access to Vault: ", vaultError.message);
      mongoURI = process.env.MONGODB_URI;
    }

    if (!mongoURI) {
      throw new Error("MongoDB URI not found");
    }
    console.log("Connect to mongoDB");
    await mongoose.connect(mongoURI);
    console.log("SUCCESSFUL to DB");

    const PORT = 8005;
    
    app.listen(PORT, () => {
      console.log(`User service deploy successfully, PORT: ${PORT}`)
    });
  }
  catch (error) {
    console.error("Unable to start service: ", error.message);
  }
}

// ==========================================
// ĐỊNH NGHĨA CÁC API (ROUTES)
// ==========================================

// API Test thử: Kiểm tra "sức khỏe" của Service
app.get('/api/users/health', (req, res) => {
  res.json({
    service: "User Service",
    status: "Hoạt động cực kỳ ổn định!",
    database: mongoose.connection.readyState === 1 ? "Đã kết nối" : "Mất kết nối",
    time: new Date().toISOString()
  });
});

// API Đăng ký User mới (Lưu vào MongoDB)
app.post('/api/users/register', async (req, res) => {
  try {
    console.log("Nhận yêu cầu tạo User:", req.body.username);
    
    // 1. Tạo "muối" (Salt) - Nôm na là một chuỗi ngẫu nhiên để trộn vào password
    const salt = await bcrypt.genSalt(10);
    
    // 2. Băm (Hash) mật khẩu cùng với muối
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    // 3. Tạo User mới với mật khẩu đã bị băm nát
    const newUser = new User({
      username: req.body.username,
      email: req.body.email,
      password: hashedPassword // Lưu chuỗi đã băm, KHÔNG lưu req.body.password nữa!
    });

    // 4. Lưu vào MongoDB
    const savedUser = await newUser.save();
    
    res.status(201).json({ 
      message: "Tạo tài khoản thành công và đã bảo mật!", 
      user: {
        _id: savedUser._id,
        username: savedUser.username,
        email: savedUser.email
        // Lưu ý: Tuyệt đối không trả về trường password cho người dùng xem
      }
    });
  } catch (error) {
    console.error("Lỗi khi tạo User:", error.message);
    res.status(400).json({ message: "Lỗi tạo tài khoản", error: error.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Nhận yêu cầu đăng nhập từ email:", email);

    // Tìm user theo email
    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(404).json({ message: "Lỗi: Email không tồn tại!" });
    }

    // So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Lỗi: Sai mật khẩu!" });
    }

    res.status(200).json({ 
      message: "Đăng nhập thành công!",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error("Lỗi khi đăng nhập:", error.message);
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
});

// Chạy hàm khởi động
startServer();