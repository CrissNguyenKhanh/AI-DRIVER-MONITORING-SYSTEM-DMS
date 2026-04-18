import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "../styles/App.css";

import PatientStatistics from "../features/admin/components/PatientStatistics";
import Login from "../features/auth/components/Login";
import DriverMonitorDMS from "../features/dms/components/DriverMonitorDMS.page";
import FaceDetect from "../features/dms/components/face_detect";
import VerifyPro from "../features/auth/components/verifypro";
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<DriverMonitorDMS />} />
        {/* Hệ thống giám sát lái xe DMS */}
        <Route path="/dms" element={<DriverMonitorDMS />} />
        {/* Trang thống kê Admin */}
        <Route path="/admin" element={<PatientStatistics />} />
        {/* Trang xác thực */}
        <Route path="/verify" element={<VerifyPro />} />
        {/* Trang đăng ký khuôn mặt tài xế */}
        <Route path="/driver-registration" element={<FaceDetect />} />
      </Routes>
    </Router>
  );
}

export default App;
