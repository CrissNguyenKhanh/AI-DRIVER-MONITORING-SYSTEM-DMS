import React, { useState } from 'react';
import { User, Lock, Mail, Phone, Activity, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { getMedicalApiBase } from "../../../shared/constants/apiEndpoints";

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // State form khớp với Backend Python
  const [formData, setFormData] = useState({
    email: '',      // Backend dùng email để login
    password: '',
    name: '',       // Backend dùng 'name' thay vì 'full_name'
    phone: '',      // Backend có trường phone
    role: 'user'
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      
      // Chuẩn bị payload khớp với backend
      const payload = isLogin 
        ? { email: formData.email, password: formData.password }
        : { 
            name: formData.name, 
            email: formData.email, 
            phone: formData.phone, 
            password: formData.password, 
            role: formData.role 
          };

      // Gọi API Flask (đảm bảo Backend đang chạy ở port 5000)
      const response = await fetch(`${getMedicalApiBase()}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (isLogin) {
          // 1. Lưu Token và User info vào localStorage
          localStorage.setItem('token', data.access_token);
          localStorage.setItem('user', JSON.stringify(data.user));
          
          // 2. Điều hướng dựa trên Role
          const userRole = data.user?.role;
          if (userRole === 'admin') {
            window.location.href = '/admin'; // Trang Admin
          } else {
            window.location.href = '/spam'; // Trang User thường
          }
        } else {
          // Đăng ký thành công -> Chuyển sang tab Login
          setIsLogin(true);
          setFormData(prev => ({ ...prev, password: '' })); // Xóa pass
          setError('Đăng ký thành công! Vui lòng đăng nhập.');
        }
      } else {
        // Hiển thị lỗi từ Backend trả về
        setError(data.error || 'Đã xảy ra lỗi. Vui lòng thử lại!');
      }
    } catch (err) {
      setError('Không thể kết nối đến server (Port 5000). Hãy chắc chắn Backend đang chạy!');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center p-4">
      {/* Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      {/* Main Container */}
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="grid md:grid-cols-2 gap-0">
          
          {/* Left Side - Branding */}
          <div className="bg-gradient-to-br from-blue-600 to-cyan-600 p-12 text-white flex flex-col justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white opacity-5 rounded-full -ml-24 -mb-24"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <Activity className="w-12 h-12" />
                <h1 className="text-3xl font-bold">Medical AI</h1>
              </div>
              
              <h2 className="text-4xl font-bold mb-4">
                {isLogin ? 'Chào mừng trở lại!' : 'Tham gia cùng chúng tôi'}
              </h2>
              
              <p className="text-blue-100 text-lg mb-8">
                Hệ thống chẩn đoán bệnh thông minh với công nghệ AI tiên tiến
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">✓</div>
                  <div>
                    <h3 className="font-semibold mb-1">Chẩn đoán chính xác</h3>
                    <p className="text-sm text-blue-100">Phân tích triệu chứng bằng AI Naive Bayes</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">✓</div>
                  <div>
                    <h3 className="font-semibold mb-1">Theo dõi sức khỏe</h3>
                    <p className="text-sm text-blue-100">Lưu trữ hồ sơ bệnh án cá nhân</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="p-12">
            <div className="max-w-md mx-auto">
              
              {/* Toggle Buttons */}
              <div className="flex gap-2 mb-8 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => { setIsLogin(true); setError(''); }}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${isLogin ? 'bg-white text-blue-600 shadow-md' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Đăng nhập
                </button>
                <button
                  onClick={() => { setIsLogin(false); setError(''); }}
                  className={`flex-1 py-3 rounded-lg font-semibold transition-all ${!isLogin ? 'bg-white text-blue-600 shadow-md' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Đăng ký
                </button>
              </div>

              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                {isLogin ? 'Đăng nhập hệ thống' : 'Tạo tài khoản mới'}
              </h3>
              
              {/* Error/Success Message */}
              {error && (
                <div className={`mb-6 p-4 rounded-xl ${error.includes('thành công') ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'}`}>
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                
                {/* Full Name (Register only) */}
                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Họ và tên</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        name="name" // Đổi thành name để khớp backend
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Nguyễn Văn A"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Email (Both Login & Register) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="email@example.com"
                      required
                    />
                  </div>
                </div>

                {/* Phone (Register only) */}
                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Số điện thoại</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0912345678"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mật khẩu</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Role Selection (Register only) */}
                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Vai trò</label>
                    <select
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      <option value="user">Người dùng (Bệnh nhân)</option>
                      <option value="admin">Quản trị viên (Bác sĩ)</option>
                    </select>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-4 rounded-xl font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <span>Đang xử lý...</span>
                  ) : (
                    <>
                      <span>{isLogin ? 'Đăng nhập' : 'Đăng ký ngay'}</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              {/* Footer Note */}
              <p className="text-center text-sm text-gray-500 mt-6">
                {isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'} {' '}
                <button
                  onClick={() => { setIsLogin(!isLogin); setError(''); }}
                  className="text-blue-600 font-semibold hover:text-blue-700"
                >
                  {isLogin ? 'Đăng ký ngay' : 'Đăng nhập'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;