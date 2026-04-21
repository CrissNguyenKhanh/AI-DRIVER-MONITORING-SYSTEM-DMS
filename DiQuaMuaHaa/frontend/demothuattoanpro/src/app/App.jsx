import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import "../styles/App.css";
import PatientStatistics from "../features/admin/components/PatientStatistics";
import Login from "../features/auth/components/Login";
import VerifyPro from "../features/auth/components/verifypro";
import DriverMonitorDMS from "../features/dms/components/DriverMonitorDMS.page";
import DectionHand from "../features/gestures/components/dectionhand";
import EnhancedPatientStatistics from "../features/user/components/endhaintstatics";
import MedicalDiagnosisAI from "../features/user/components/khanhku";
import MedicalRecordConfirmation from "../features/user/components/vippoint";
import Thumuctest from "../testdata/thucmuctest";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<PatientStatistics />} />
        <Route path="/spam" element={<MedicalDiagnosisAI />} />
        <Route path="/test1" element={<MedicalRecordConfirmation />} />
        <Route path="/test2" element={<EnhancedPatientStatistics />} />
        <Route path="/test3" element={<Thumuctest />} />
        <Route path="/test4" element={<DectionHand />} />
        <Route path="/verifypro" element={<VerifyPro />} />
        <Route path="/test5" element={<DriverMonitorDMS />} />
      </Routes>
    </Router>
  );
}

export default App;

