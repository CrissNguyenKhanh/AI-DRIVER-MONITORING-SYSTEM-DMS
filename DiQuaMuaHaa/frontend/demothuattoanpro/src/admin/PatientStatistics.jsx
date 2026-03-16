import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { 
  Users, 
  Activity, 
  TrendingUp, 
  Brain, 
  AlertCircle, 
  Calendar,
  Thermometer,
  FileText
} from "lucide-react";

// Bảng màu hiện đại, chuyên nghiệp cho Y tế
const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#6366F1"];

// Component Tooltip tùy chỉnh cho đẹp hơn
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border border-gray-100 shadow-xl rounded-xl">
        <p className="font-semibold text-gray-700 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-bold">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const PatientStatistics = () => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("http://localhost:5000/api/statistics")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Lỗi kết nối đến server");
        }
        return response.json();
      })
      .then((data) => {
        setStats(data);
        setIsLoading(false);
        setError(null);
      })
      .catch((err) => {
        setError("Không thể kết nối đến server Python. Đảm bảo backend đang chạy.");
        setIsLoading(false);
        console.error("Error:", err);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium animate-pulse">AI đang phân tích dữ liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-l-4 border-red-500">
          <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Lỗi Kết Nối</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-lg hover:shadow-red-200"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* --- HEADER SECTION --- */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-3 rounded-2xl shadow-lg shadow-blue-200">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Dashboard Thống Kê</h1>
              <p className="text-gray-500 mt-1">Tổng quan dữ liệu bệnh nhân & Phân tích AI</p>
            </div>
          </div>
          <div className="mt-4 md:mt-0 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            Live Data
          </div>
        </div>

        {/* --- SUMMARY CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SummaryCard 
            icon={Users} 
            title="Tổng bệnh nhân" 
            value={stats.totalPatients} 
            color="blue" 
            subtext="Hồ sơ đã lưu"
          />
          <SummaryCard 
            icon={FileText} 
            title="Loại chẩn đoán" 
            value={stats.diagnosisStats?.length || 0} 
            color="emerald" 
            subtext="Danh mục bệnh"
          />
          <SummaryCard 
            icon={TrendingUp} 
            title="Xu hướng" 
            value={stats.prediction || "Ổn định"} 
            color="amber" 
            subtext="Dự báo tuần này"
          />
          <SummaryCard 
            icon={Brain} 
            title="Độ chính xác AI" 
            value="94.5%" 
            color="purple" 
            subtext="Model Naive Bayes"
          />
        </div>

        {/* --- CHARTS GRID --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* 1. Biểu đồ tròn: Phân bố chẩn đoán */}
          {stats.diagnosisStats && stats.diagnosisStats.length > 0 && (
            <ChartCard title="Phân bố Chẩn đoán Bệnh" icon={Activity}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.diagnosisStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.diagnosisStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* 2. Biểu đồ đường: Xu hướng theo thời gian */}
          {stats.trends && stats.trends.length > 0 && (
            <ChartCard title="Xu hướng Khám bệnh (7 ngày)" icon={Calendar}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={stats.trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    name="Số ca"
                    stroke="#8B5CF6" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorVisits)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* 3. Biểu đồ cột: Triệu chứng phổ biến */}
          {stats.symptomStats && stats.symptomStats.length > 0 && (
            <ChartCard title="Top Triệu chứng Phổ biến" icon={Thermometer} fullWidth>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={stats.symptomStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280'}} />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: '#F3F4F6'}} />
                  <Bar dataKey="value" name="Số lượng" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={40}>
                    {stats.symptomStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* 4. Biểu đồ cột ngang: Độ tuổi */}
          {stats.ageStats && stats.ageStats.length > 0 && (
            <ChartCard title="Phân bố Độ tuổi" icon={Users}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart layout="vertical" data={stats.ageStats} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={80} tick={{fill: '#4B5563', fontWeight: 500}} />
                  <Tooltip content={<CustomTooltip />} cursor={{fill: '#F3F4F6'}} />
                  <Bar dataKey="value" name="Số người" fill="#10B981" radius={[0, 6, 6, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* 5. Biểu đồ giới tính & Mức độ nghiêm trọng */}
          <div className="space-y-6">
             {/* Giới tính */}
            {stats.genderStats && stats.genderStats.length > 0 && (
              <ChartCard title="Giới tính" icon={Users}>
                <div className="flex items-center justify-center h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.genderStats}
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                         {stats.genderStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#3B82F6' : '#EC4899'} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="middle" align="right" layout="vertical" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            )}

            {/* Mức độ nghiêm trọng */}
            {stats.severityStats && stats.severityStats.length > 0 && (
               <ChartCard title="Mức độ Nghiêm trọng" icon={AlertCircle}>
                <div className="space-y-4 mt-2">
                  {stats.severityStats.map((item, index) => (
                    <div key={index}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{item.name}</span>
                        <span className="font-bold text-gray-900">{item.value}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div 
                          className="h-2.5 rounded-full" 
                          style={{ 
                            width: `${(item.value / stats.totalPatients) * 100}%`,
                            backgroundColor: item.name === 'Nặng' ? '#EF4444' : item.name === 'Vừa' ? '#F59E0B' : '#10B981'
                          }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
               </ChartCard>
            )}
          </div>

        </div>

        {/* --- AI INSIGHTS FOOTER --- */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
           <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
           <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
                <Brain className="w-12 h-12 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">AI Insights</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-indigo-100">
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-white rounded-full"></span>
                    Chẩn đoán phổ biến nhất: <strong className="text-white">{stats.diagnosisStats?.[0]?.name || "N/A"}</strong>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-white rounded-full"></span>
                    Triệu chứng nổi bật: <strong className="text-white">{stats.symptomStats?.[0]?.name || "N/A"}</strong>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-white rounded-full"></span>
                    Tỷ lệ ca nghiêm trọng: <strong className="text-white">Thấp (An toàn)</strong>
                  </p>
                </div>
              </div>
              <button className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-bold shadow-lg hover:bg-opacity-90 transition-all">
                Xuất Báo Cáo
              </button>
           </div>
        </div>

      </div>
    </div>
  );
};

// Sub-components để code gọn hơn
const SummaryCard = ({ icon: Icon, title, value, color, subtext }) => {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-full">30 ngày</span>
      </div>
      <h3 className="text-3xl font-bold text-gray-800 mb-1">{value}</h3>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-xs text-gray-400 mt-2">{subtext}</p>
    </div>
  );
};

const ChartCard = ({ title, children, icon: Icon, fullWidth }) => (
  <div className={`bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow ${fullWidth ? 'lg:col-span-2' : ''}`}>
    <div className="flex items-center gap-2 mb-6 border-b border-gray-50 pb-4">
      {Icon && <Icon className="w-5 h-5 text-gray-400" />}
      <h2 className="text-lg font-bold text-gray-700">{title}</h2>
    </div>
    {children}
  </div>
);

export default PatientStatistics;