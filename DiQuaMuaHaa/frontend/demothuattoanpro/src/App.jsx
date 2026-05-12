import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";

import Login from "./features/auth/components/Login";
import Thumuctest from "./features/dms/DmsDashboard";
import DectionHand from "./features/gestures/components/handDetection";
import Verification from "./features/auth/components/verification";

import { FaceDetect } from "./features/dms/components";
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Thumuctest />} />
        {/* Trang thống kê */}
        {/* Trang Test 3 */}
        <Route path="/test3" element={<Thumuctest />} />
        {/* Trang Test 4 */}
        <Route path="/test4" element={<DectionHand />} />
       {/* trang tesst cua verify pro */}
        <Route path="/verifypro" element={<Verification />} />

        <Route path="/test5" element={<FaceDetect />} />
      </Routes>
    </Router>
  );
}

export default App;
