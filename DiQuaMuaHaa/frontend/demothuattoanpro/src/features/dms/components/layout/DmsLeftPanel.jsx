import React from "react";
import Head3D from "../telemetry/Head3D";
import EyeCanvas from "../telemetry/EyeCanvas";
import WaveformCanvas from "../telemetry/WaveformCanvas";

function DmsLeftPanel({
  poseRef,
  eyeDataRef,
  earHistoryRef,
  yDeg,
  pDeg,
  rDeg,
  displayEye,
  blinkHL,
}) {
  return (
    <div
      style={{
        width: "35%",
        minWidth: 340,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: "1px solid #0d1e30",
      }}
    >
      <div
        style={{
          flex: "0 0 260px",
          background: "#000",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Head3D poseRef={poseRef} />
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#000",
          overflow: "hidden",
          padding: "4px 8px",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              background: "#1e5fc0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            i
          </div>
          {["Yaw", "Pitch", "Roll"].map((label, i) => (
            <React.Fragment key={label}>
              <div
                style={{
                  background: "#0a1828",
                  border: "1px solid #1a3a58",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "#5a8ab0",
                  flex: 1,
                  textAlign: "center",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  background: "#0a1828",
                  border: "1px solid #1a3a58",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "#7ab8d8",
                  flex: 1,
                  textAlign: "center",
                }}
              >
                {[yDeg, pDeg, rDeg][i]}°
              </div>
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {[
            { label: "Pupil dilation", val: `${displayEye.pupilL}%` },
            { label: "Blink rate", val: `${displayEye.blinkRate}` },
          ].map(({ label, val }) => (
            <div
              key={label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{ fontSize: 9, color: "#5a8ab0", textAlign: "center" }}
              >
                {label}
              </span>
              <div
                style={{
                  background: "#0a1828",
                  border: "1px solid #1a3a58",
                  borderRadius: 3,
                  padding: "3px 6px",
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "#7ab8d8",
                  textAlign: "center",
                }}
              >
                {val}
              </div>
            </div>
          ))}
          <div
            style={{
              flex: 1.3,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span
              style={{ fontSize: 9, color: "#5a8ab0", textAlign: "center" }}
            >
              Blink duration
            </span>
            <div
              style={{
                background: blinkHL ? "#1e5fc0" : "#0a1828",
                border: blinkHL ? "1px solid #3b9eff" : "1px solid #1a3a58",
                borderRadius: 3,
                padding: "3px 6px",
                fontSize: 11,
                fontFamily: "monospace",
                color: blinkHL ? "#fff" : "#7ab8d8",
                textAlign: "center",
              }}
            >
              {typeof displayEye.blinkDur === "number"
                ? displayEye.blinkDur.toFixed(2)
                : "0.00"}{" "}
              sec
            </div>
          </div>
          <div
            style={{
              flex: 0.8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 9, color: "#5a8ab0" }}>Glasses</span>
            <div
              style={{
                background: "#0a1828",
                border: "1px solid #1a3a58",
                borderRadius: 3,
                padding: "2px 6px",
                fontSize: 18,
                textAlign: "center",
              }}
            >
              🕶️
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {["Left_Eye", "Right_Eye"].map((e) => (
            <div
              key={e}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 11,
                color: "#7ab8d8",
                borderBottom: "1px solid #1a3a58",
                paddingBottom: 3,
              }}
            >
              <span
                style={{ textDecoration: "underline", cursor: "pointer" }}
              >
                {e}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, height: 90 }}>
          {["left", "right"].map((side) => (
            <div
              key={side}
              style={{
                flex: 1,
                background: "#000",
                border: "1px solid #0d2a44",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <EyeCanvas eyeDataRef={eyeDataRef} side={side} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {[
            [displayEye.lYaw, displayEye.lPitch],
            [displayEye.rYaw, displayEye.rPitch],
          ].map((vals, i) => (
            <div key={i} style={{ flex: 1, display: "flex", gap: 3 }}>
              {["Yaw", "Pitch"].map((lbl, j) => (
                <div
                  key={lbl}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    flex: 1,
                  }}
                >
                  <span style={{ fontSize: 9, color: "#5a8ab0" }}>{lbl}</span>
                  <div
                    style={{
                      background: "#0a1828",
                      border: "1px solid #1a3a58",
                      borderRadius: 3,
                      padding: "3px 4px",
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "#7ab8d8",
                      textAlign: "center",
                    }}
                  >
                    {vals[j]}°
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {[
            [displayEye.lX, displayEye.lY, displayEye.lZ],
            [displayEye.rX, displayEye.rY, displayEye.rZ],
          ].map((vals, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                gap: 2,
                alignItems: "center",
              }}
            >
              {["X", "Y", "Z"].map((lbl, j) => (
                <React.Fragment key={lbl}>
                  <span
                    style={{ fontSize: 9, color: "#3a6a88", flexShrink: 0 }}
                  >
                    {lbl}
                  </span>
                  <div
                    style={{
                      background: "#0a1828",
                      border: "1px solid #1a3a58",
                      borderRadius: 3,
                      padding: "2px 4px",
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: "#7ab8d8",
                      textAlign: "center",
                      flex: 1,
                    }}
                  >
                    {vals[j]}
                  </div>
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: 5,
            minHeight: 0,
            overflow: "hidden",
            paddingBottom: 4,
          }}
        >
          {[
            ["left", 2],
            ["right", 0.7],
            ["left", 2],
            ["right", 0.7],
          ].map(([side, flex], i) => (
            <div
              key={i}
              style={{
                flex,
                background: "#000",
                border: "1px solid #0a1e30",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <WaveformCanvas
                earHistoryRef={earHistoryRef}
                side={side}
                color="#1e90ff"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DmsLeftPanel;
