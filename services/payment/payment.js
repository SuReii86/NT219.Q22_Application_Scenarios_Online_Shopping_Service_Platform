require('dotenv').config();
const express = require('express');

// 1. Kết nối Vault (Lấy token từ biến môi trường mà nhóm trưởng đã cấu hình)
const vault = require('node-vault')({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
  token: process.env.VAULT_TOKEN
});

const app = express();
app.use(express.json());

let stripe; 

// 2. Hàm khởi động: Lên Vault lấy Key rồi mới chạy Server
async function startPaymentServer() {
  try {
    console.log("⏳ Đang gọi Vault lấy Stripe Secret Key...");
    
    // Đọc secret từ đường dẫn bạn vừa lưu ở Bước 2
    const vaultRes = await vault.read('secret/data/payment-credentials');
    const stripeKey = vaultRes.data.data.STRIPE_SECRET_KEY;
    
    // Khởi tạo Stripe bằng Key lấy từ Vault (Tuyệt đối an toàn)
    stripe = require('stripe')(stripeKey);
    console.log("✅ Đã khởi tạo Stripe thành công!");

    // --- CÁC API CỦA PAYMENT SERVICE ---

    // API 1: Test sức khỏe
    app.get('/api/payment/health', (req, res) => {
      res.json({ service: "Payment", status: "OK", protectedBy: "Vault & Envoy" });
    });

    // API 2: Tạo phiên giao dịch (Không lưu thẻ)
    app.post('/api/payment/create-intent', async (req, res) => {
      try {
        const { amount, currency = 'usd' } = req.body;
        console.log(`📥 Yêu cầu thanh toán: ${amount} ${currency}`);

        // Gọi Stripe tạo PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount, 
          currency: currency,
          automatic_payment_methods: { enabled: true },
        });

        // Trả Client Secret về cho Frontend xử lý tiếp
        res.status(200).json({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error("❌ Lỗi Stripe:", error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // --- MỞ CỔNG CHẠY SERVICE ---
    const PORT = 8004;
    app.listen(PORT, () => {
      console.log(`💳 Payment Service đang chạy tại cổng ${PORT}`);
    });

  } catch (error) {
    console.error("❌ Lỗi Server:", error.message);
    process.exit(1);
  }
}

// Bắt đầu!
startPaymentServer();