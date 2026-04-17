import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "../styles/App.css";

import PatientStatistics from "../features/admin/components/PatientStatistics";
import Login from "../Login/Login";
import MedicalDiagnosisAI from "../features/user/components/khanhku";
import MedicalRecordConfirmation from "../features/user/components/vippoint";
import EnhancedPatientStatistics from "../features/user/components/endhaintstatics";
import Thumuctest from "../testdata/thucmuctest";
import DectionHand from "../features/gestures/components/dectionhand";
import VerifyPro from "../verify/verifypro";

import FaceDetect from "../features/dms/components/face_detect";
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        {/* Trang thống kê */}
        <Route path="/admin" element={<PatientStatistics />} />
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
      </Routes>
    </Router>
  );
}

export default App;
