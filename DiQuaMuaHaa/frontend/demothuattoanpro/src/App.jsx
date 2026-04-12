import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import Layout from "./components/Layout";
import DriverMonitorDMS from "./testdata/thucmuctest";
import FaceDetect from "./systeamdetectface/face_detect";
import DectionHand from "./hand-dection/dectionhand";
import DrivingSessions from "./pages/DrivingSessions";

import Login from "./Login/Login";
import PatientStatistics from "./admin/PatientStatistics";
import MedicalDiagnosisAI from "./User/khanhku";
import MedicalRecordConfirmation from "./User/vippoint";
import EnhancedPatientStatistics from "./User/endhaintstatics";
import VerifyPro from "./verify/verifypro";

function App() {
  return (
    <Router>
      <Routes>
        {/* Trang đăng nhập — không cần Layout */}
        <Route path="/login" element={<Login />} />

        {/* DMS Dashboard */}
        <Route
          path="/"
          element={
            <Layout>
              <DriverMonitorDMS />
            </Layout>
          }
        />

        {/* Nhận diện danh tính */}
        <Route
          path="/identity"
          element={
            <Layout>
              <FaceDetect />
            </Layout>
          }
        />

        {/* Nhận diện tay */}
        <Route
          path="/hand"
          element={
            <Layout>
              <DectionHand />
            </Layout>
          }
        />

        {/* Lịch sử lái xe */}
        <Route
          path="/sessions"
          element={
            <Layout>
              <DrivingSessions />
            </Layout>
          }
        />

        {/* Trang thống kê admin */}
        <Route
          path="/admin"
          element={
            <Layout>
              <PatientStatistics />
            </Layout>
          }
        />

        {/* Spam / AI Diagnosis */}
        <Route
          path="/spam"
          element={
            <Layout>
              <MedicalDiagnosisAI />
            </Layout>
          }
        />

        {/* Medical Record Confirmation */}
        <Route
          path="/test1"
          element={
            <Layout>
              <MedicalRecordConfirmation />
            </Layout>
          }
        />

        {/* Enhanced Patient Statistics */}
        <Route
          path="/test2"
          element={
            <Layout>
              <EnhancedPatientStatistics />
            </Layout>
          }
        />

        {/* Verify Pro */}
        <Route
          path="/verifypro"
          element={
            <Layout>
              <VerifyPro />
            </Layout>
          }
        />

        {/* Redirect mọi route không xác định về trang chính */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
