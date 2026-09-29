import { BrowserRouter as Router, Navigate, Routes, Route } from "react-router-dom";
import "./App.css";

import PatientStatistics from "./admin/PatientStatistics";
import Login from "./Login/Login";
import MedicalDiagnosisAI from "./User/khanhku";
import MedicalRecordConfirmation from "./User/vippoint";
import EnhancedPatientStatistics from "./User/endhaintstatics";
import Thumuctest from "./testdata/thucmuctest";
import DectionHand from "./hand-dection/dectionhand";
import VerifyPro from "./verify/verifypro";
import Khanhregister from "./Khanhregister";

import FaceDetect from "./systeamdetectface/face_detect";
import ADASSimulation from "./adas/ADASSimulation";
import { getStoredMedicalUser } from "./utils/authApi";

function RequireAdmin({ children }) {
  const user = getStoredMedicalUser();
  const hasToken = Boolean(window.localStorage.getItem("token"));
  return hasToken && user?.role === "admin" ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Khanhregister />} />
        <Route path="/login" element={<Login />} />
        {/* Trang thống kê */}
        <Route path="/admin" element={<RequireAdmin><PatientStatistics /></RequireAdmin>} />
        {/* Trang Spam Detector */}
        <Route path="/spam" element={<MedicalDiagnosisAI />} />

        <Route path="/test1" element={<MedicalRecordConfirmation />} />
        {/* Trang Spam Detector */}
        <Route path="/test2" element={<EnhancedPatientStatistics />} />
        {/* Trang Test 3 */}
        <Route path="/test3" element={<Thumuctest />} />
        {/* Trang Test 4 */}
        <Route path="/test4" element={<DectionHand />} />
       {/* trang tesst cua verify pro */}
        <Route path="/verifypro" element={<VerifyPro />} />

        <Route path="/test5" element={<FaceDetect />} />
        <Route path="/adas-simulation" element={<ADASSimulation />} />
      </Routes>
    </Router>
  );
}

export default App;
