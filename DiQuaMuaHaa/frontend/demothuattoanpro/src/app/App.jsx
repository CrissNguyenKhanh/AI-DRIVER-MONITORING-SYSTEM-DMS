import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "../styles/App.css";

import PatientStatistics from "../features/admin/components/PatientStatistics";
import Login from "../features/auth/components/Login";
import DriverMonitorDMS from "../features/dms/components/DriverMonitorDMS.page";
import VerifyPro from "../features/auth/components/verifypro";
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        {/* Hệ thống giám sát lái xe DMS */}
        <Route path="/dms" element={<DriverMonitorDMS />} />
        {/* Trang thống kê Admin */}
        <Route path="/admin" element={<PatientStatistics />} />
        {/* Trang xác thực */}
        <Route path="/verify" element={<VerifyPro />} />
      </Routes>
    </Router>
  );
}

export default App;
