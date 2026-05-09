import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";

import "../styles/App.css";
import VerifyPro from "../features/auth/components/verifypro";
import DriverMonitorDMS from "../features/dms/components/DriverMonitorDMS.page";
import DectionHand from "../features/gestures/components/dectionhand";
import Thumuctest from "../testdata/thucmuctest";

function App() {
  return (
    <Router>
      <Routes>
        {/* Default redirect to DMS Dashboard */}
        <Route path="/" element={<Navigate to="/test3" replace />} />
        <Route path="/test3" element={<Thumuctest />} />
        <Route path="/test4" element={<DectionHand />} />
        <Route path="/verifypro" element={<VerifyPro />} />
        <Route path="/test5" element={<DriverMonitorDMS />} />
        {/* Legacy medical routes removed - redirect to main DMS */}
        <Route path="/admin" element={<Navigate to="/test3" replace />} />
        <Route path="/spam" element={<Navigate to="/test3" replace />} />
        <Route path="/test1" element={<Navigate to="/test3" replace />} />
        <Route path="/test2" element={<Navigate to="/test3" replace />} />
        <Route path="/login" element={<Navigate to="/test3" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

