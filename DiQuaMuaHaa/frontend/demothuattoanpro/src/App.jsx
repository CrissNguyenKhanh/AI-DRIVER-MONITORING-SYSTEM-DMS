import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import Layout from "./components/Layout";
import DriverMonitorDMS from "./testdata/thucmuctest";
import FaceDetect from "./systeamdetectface/face_detect";
import DectionHand from "./hand-dection/dectionhand";
import DrivingSessions from "./pages/DrivingSessions";

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <Layout>
              <DriverMonitorDMS />
            </Layout>
          }
        />
        <Route
          path="/identity"
          element={
            <Layout>
              <FaceDetect />
            </Layout>
          }
        />
        <Route
          path="/hand"
          element={
            <Layout>
              <DectionHand />
            </Layout>
          }
        />
        <Route
          path="/sessions"
          element={
            <Layout>
              <DrivingSessions />
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
