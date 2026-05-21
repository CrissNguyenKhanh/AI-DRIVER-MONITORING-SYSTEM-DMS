import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import Login from "./features/auth/components/Login";
import Thumuctest from "./features/dms/DmsDashboard";
import DectionHand from "./features/gestures/components/handDetection";
import Verification from "./features/auth/components/verification";

import { FaceDetect } from "./features/dms/components";

const FACE_VERIFIED_KEY = "dms_face_verified_v1";

function hasVerifiedFaceSession() {
  try {
    return window.sessionStorage.getItem(FACE_VERIFIED_KEY) === "true";
  } catch {
    return false;
  }
}

function ProtectedDashboard() {
  return hasVerifiedFaceSession() ? (
    <Thumuctest />
  ) : (
    <Navigate to="/test5" replace />
  );
}
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ProtectedDashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        {/* Trang thống kê */}
        {/* Trang Test 3 */}
        <Route path="/test3" element={<ProtectedDashboard />} />
        {/* Trang Test 4 */}
        <Route path="/test4" element={<DectionHand />} />
       {/* trang tesst cua verify pro */}
        <Route path="/verifypro" element={<Verification />} />

        <Route path="/test5" element={<FaceDetect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
