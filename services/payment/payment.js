require('dotenv').config();
const express = require('express');

// 1. Khởi tạo kết nối Vault
const vault = require('node-vault')({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR || 'http://vault:8200',
  token: process.env.VAULT_TOKEN
});

const app = express();
app.use(express.json());

let stripe; // Biến này sẽ giữ thực thể Stripe sau khi lấy được Key từ Vault

// 2. Hàm khởi động hệ thống
async function startPaymentServer() {
  try {
    console.log("⏳ Đang gọi Vault để lấy Stripe Secret Key...");
    console.log("🔍 Kiểm tra Token hiện tại:", process.env.VAULT_TOKEN ? "✅ Đã nhận được" : "❌ TRỐNG");

    // Lấy Secret từ Vault (đường dẫn chuẩn KV-v2)
    const vaultRes = await vault.read('secret/data/payment-credentials');
    const stripeKey = vaultRes.data.data.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      throw new Error("Không tìm thấy STRIPE_SECRET_KEY trong Vault!");
    }

    // Khởi tạo Stripe thật
    stripe = require('stripe')(stripeKey);
    console.log("✅ Đã khởi tạo Stripe thành công bằng Key từ Vault!");

    // ==========================================
    // CÁC API CỦA PAYMENT SERVICE
    // ==========================================

    // API 1: Test sức khỏe đơn giản
    app.get('/api/payment/health', (req, res) => {
      res.json({ 
        service: "Payment Service", 
        status: "OK", 
        protectedBy: "HashiCorp Vault" 
      });
    });

    // API 2: Kiểm tra trạng thái kết nối chi tiết
    app.get('/api/payment/status', async (req, res) => {
      try {
        const vaultCheck = await vault.read('secret/data/payment-credentials');
        res.json({
          service: "Payment Service",
          vault_connection: "Connected",
          stripe_initialized: !!stripe,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        res.status(500).json({ error: "Lỗi kết nối Vault", details: err.message });
      }
    });

    // API 3: Tạo phiên giao dịch thật trên Stripe
    app.post('/api/payment/create-intent', async (req, res) => {
      try {
        const { amount, currency = 'usd' } = req.body;

        if (!amount) {
          return res.status(400).json({ error: "Vui lòng nhập số tiền (amount)" });
        }

        console.log(`💳 Đang tạo giao dịch: ${amount} ${currency}`);

        // Gọi Stripe API thật để tạo Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount, // Đơn vị là cent (VD: 100 = 1 USD)
          currency: currency,
          automatic_payment_methods: { enabled: true },
        });

        res.status(200).json({
          message: "Tạo phiên thanh toán thành công!",
          intentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret, // Dùng để frontend hiển thị form thẻ
          status: paymentIntent.status
        });

      } catch (error) {
        console.error("❌ Lỗi Stripe:", error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // --- MỞ CỔNG CHẠY SERVICE ---
    const PORT = 8004;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Payment Service đang lắng nghe tại cổng ${PORT}`);
    });

  } catch (error) {
    console.error("❌ Lỗi khởi động Server:", error.message);
    process.exit(1);
  }
}

startPaymentServer();