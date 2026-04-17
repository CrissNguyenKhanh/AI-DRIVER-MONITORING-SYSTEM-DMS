import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./styles/App.css";

import PatientStatistics from "./admin/PatientStatistics";
import Login from "./Login/Login";
import MedicalDiagnosisAI from "./User/khanhku";
import MedicalRecordConfirmation from "./User/vippoint";
import EnhancedPatientStatistics from "./User/endhaintstatics";
import Thumuctest from "./testdata/thucmuctest";
import DectionHand from "./hand-dection/dectionhand";
import VerifyPro from "./verify/verifypro";

import FaceDetect from "./systeamdetectface/face_detect";
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
