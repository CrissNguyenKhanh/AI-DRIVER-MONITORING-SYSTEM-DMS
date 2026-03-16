import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Stethoscope } from "lucide-react";

const DoctorChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Xin chào! Tôi là trợ lý Dr. AI. Bạn đang cảm thấy thế nào hôm nay?",
      sender: "bot",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Database kiến thức y tế
  const medicalKnowledge = {
    // Triệu chứng cảm cúm
    greetings: {
      keywords: ["xin chào", "hello", "hi", "chào", "hey"],
      responses: [
        "Xin chào! Tôi là bác sĩ AI. Bạn có thể mô tả triệu chứng của mình không?",
        "Chào bạn! Hãy cho tôi biết bạn đang gặp vấn đề gì về sức khỏe nhé.",
        "Hello! Tôi sẵn sàng tư vấn sức khỏe cho bạn. Bạn cảm thấy như thế nào?",
      ],
    },
    flu: {
      keywords: [
        "sốt",
        "ho",
        "cảm cúm",
        "cảm",
        "đau đầu",
        "chảy nước mũi",
        "hắt hơi",
      ],
      responses: [
        "Dựa trên triệu chứng, bạn có thể bị cảm cúm. Tôi khuyên bạn:\n• Nghỉ ngơi đầy đủ\n• Uống nhiều nước ấm\n• Dùng thuốc hạ sốt nếu cần\n• Nếu sốt cao trên 39°C hoặc kéo dài >3 ngày, hãy đến bệnh viện",
      ],
    },
    pneumonia: {
      keywords: ["khó thở", "đau ngực", "viêm phổi", "ho có đờm", "sốt cao"],
      responses: [
        "⚠️ Triệu chứng của bạn có thể nghiêm trọng (viêm phổi). Tôi khuyên bạn:\n• ĐẾN BỆNH VIỆN NGAY LẬP TỨC\n• Cần chụp X-quang phổi\n• Có thể cần dùng kháng sinh\n• Không tự điều trị tại nhà",
      ],
    },
    throatPain: {
      keywords: ["đau họng", "viêm họng", "khó nuốt", "sưng họng"],
      responses: [
        "Có vẻ bạn bị viêm họng. Hãy thử:\n• Súc họng bằng nước muối ấm\n• Uống nhiều nước\n• Tránh đồ cay nóng\n• Nghỉ ngơi, hạn chế nói nhiều\n• Nếu >5 ngày không đỡ, hãy khám bác sĩ",
      ],
    },
    stomachache: {
      keywords: [
        "đau bụng",
        "đau dạ dày",
        "buồn nôn",
        "nôn",
        "tiêu chảy",
        "chướng bụng",
      ],
      responses: [
        "Triệu chứng dạ dày/tiêu hóa. Lời khuyên:\n• Ăn nhẹ nhàng, chia nhiều bữa\n• Tránh đồ cay, rượu bia, cafe\n• Uống nước gạo, cháo loãng\n• Nghỉ ngơi\n• Nếu đau dữ dội hoặc có máu, đi bệnh viện ngay",
      ],
    },
    headache: {
      keywords: ["đau đầu", "choáng váng", "chóng mặt", "hoa mắt"],
      responses: [
        "Đau đầu có thể do nhiều nguyên nhân:\n• Nghỉ ngơi trong phòng tối\n• Massage nhẹ vùng thái dương\n• Uống đủ nước\n• Tránh ánh sáng chói\n• Nếu đau đột ngột, dữ dội kèm buồn nôn → đi bệnh viện",
      ],
    },
    allergy: {
      keywords: ["dị ứng", "ngứa", "phát ban", "nổi mề đay", "sưng"],
      responses: [
        "Có thể bạn bị dị ứng:\n• Tránh xa chất gây dị ứng\n• Uống thuốc kháng histamin (nếu có)\n• Chườm lạnh vùng ngứa\n• Nếu sưng mặt/khó thở → CẤP CỨU NGAY",
      ],
    },
    tired: {
      keywords: ["mệt mỏi", "uể oải", "không có sức", "yếu", "kiệt sức"],
      responses: [
        "Mệt mỏi có thể do:\n• Thiếu ngủ → Ngủ đủ 7-8h/đêm\n• Thiếu dinh dưỡng → Ăn uống đầy đủ\n• Stress → Thư giãn, vận động nhẹ\n• Nếu mệt kéo dài >2 tuần, hãy xét nghiệm máu",
      ],
    },
    diabetes: {
      keywords: ["tiểu đường", "khát nước", "tiểu nhiều", "đường huyết"],
      responses: [
        "⚠️ Triệu chứng nghi tiểu đường. Cần làm:\n• ĐO ĐƯỜNG HUYẾT NGAY\n• Gặp bác sĩ nội tiết\n• Kiểm soát ăn uống (giảm đường, tinh bột)\n• Tập thể dục đều đặn\n• Theo dõi cân nặng",
      ],
    },
    covid: {
      keywords: ["covid", "corona", "mất vị giác", "mất khứu giác"],
      responses: [
        "Triệu chứng nghi COVID-19:\n• Cách ly tại nhà ngay\n• Test nhanh/PCR\n• Theo dõi SpO2 (nồng độ oxy)\n• Uống nhiều nước, nghỉ ngơi\n• Nếu khó thở, SpO2 <95% → Gọi cấp cứu",
      ],
    },
    thanks: {
      keywords: ["cảm ơn", "thank", "thanks", "cám ơn"],
      responses: [
        "Rất vui được giúp bạn! Hãy chăm sóc sức khỏe nhé! 😊",
        "Không có gì! Chúc bạn mau khỏe! 💪",
        "Sức khỏe là vàng! Hãy giữ gìn sức khỏe nhé!",
      ],
    },
    emergency: {
      keywords: ["cấp cứu", "khẩn cấp", "nguy hiểm", "tai nạn", "gãy xương"],
      responses: [
        "🚨 TÌNH HUỐNG KHẨN CẤP:\n• GỌI 115 NGAY LẬP TỨC\n• Giữ bình tĩnh\n• Không di chuyển nạn nhân nếu nghi gãy xương\n• Nếu chảy máu → ấn trực tiếp vào vết thương",
      ],
    },
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Hàm phân tích tin nhắn và trả lời thông minh
  const getSmartResponse = (userMessage) => {
    const msg = userMessage.toLowerCase().trim();

    // Tìm category phù hợp nhất
    let matchedCategory = null;
    let maxMatches = 0;

    for (const [category, data] of Object.entries(medicalKnowledge)) {
      const matches = data.keywords.filter((keyword) =>
        msg.includes(keyword)
      ).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        matchedCategory = data;
      }
    }

    // Nếu tìm thấy category phù hợp
    if (matchedCategory && maxMatches > 0) {
      const responses = matchedCategory.responses;
      return responses[Math.floor(Math.random() * responses.length)];
    }

    // Câu trả lời mặc định nếu không hiểu
    const defaultResponses = [
      "Xin lỗi, tôi không hiểu rõ triệu chứng của bạn. Bạn có thể mô tả chi tiết hơn được không?\nVí dụ: 'Tôi bị sốt và ho', 'Tôi đau bụng'...",
      "Hãy mô tả cụ thể triệu chứng của bạn để tôi tư vấn tốt hơn nhé!\nVí dụ: đau họng, sốt, buồn nôn, đau đầu...",
      "Tôi cần thêm thông tin về triệu chứng của bạn. Bạn có thể kể chi tiết hơn không?",
    ];

    return defaultResponses[
      Math.floor(Math.random() * defaultResponses.length)
    ];
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg = { id: Date.now(), text: inputText, sender: "user" };
    setMessages((prev) => [...prev, userMsg]);

    const messageToProcess = inputText;
    setInputText("");
    setIsLoading(true);

    // Giả lập delay để trông giống AI thật
    setTimeout(() => {
      const botResponse = getSmartResponse(messageToProcess);
      const botMsg = {
        id: Date.now() + 1,
        text: botResponse,
        sender: "bot",
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsLoading(false);
    }, 800);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div style={styles.wrapper}>
      {!isOpen && (
        <button onClick={() => setIsOpen(true)} style={styles.toggleButton}>
          <MessageCircle size={28} color="white" />
          <span style={styles.badge}>AI</span>
        </button>
      )}

      {isOpen && (
        <div style={styles.chatWindow}>
          <div style={styles.header}>
            <div style={styles.headerInfo}>
              <div style={styles.avatarBot}>
                <Stethoscope size={20} color="#2563eb" />
              </div>
              <div>
                <div style={styles.botName}>Bác sĩ AI (Offline)</div>
                <div style={styles.status}>● Đang hoạt động</div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} style={styles.closeBtn}>
              <X size={20} color="white" />
            </button>
          </div>

          <div style={styles.messagesArea}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  ...styles.messageRow,
                  justifyContent:
                    msg.sender === "user" ? "flex-end" : "flex-start",
                }}
              >
                {msg.sender === "bot" && (
                  <div style={styles.msgAvatar}>
                    <Stethoscope size={14} color="white" />
                  </div>
                )}
                <div
                  style={
                    msg.sender === "user" ? styles.userBubble : styles.botBubble
                  }
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={styles.loadingBubble}>
                <div style={styles.dot}></div>
                <div style={styles.dot}></div>
                <div style={styles.dot}></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={styles.inputArea}>
            <input
              type="text"
              placeholder="Nhập triệu chứng hoặc câu hỏi..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              style={styles.input}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              style={{
                ...styles.sendBtn,
                opacity: !inputText.trim() || isLoading ? 0.5 : 1,
                cursor:
                  !inputText.trim() || isLoading ? "not-allowed" : "pointer",
              }}
              disabled={!inputText.trim() || isLoading}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

const styles = {
  wrapper: {
    position: "fixed",
    bottom: "30px",
    right: "30px",
    zIndex: 1000,
    fontFamily: "'Segoe UI', sans-serif",
  },
  toggleButton: {
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    backgroundColor: "#2563eb",
    border: "none",
    boxShadow: "0 4px 15px rgba(37, 99, 235, 0.4)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.2s",
  },
  badge: {
    position: "absolute",
    top: "-5px",
    right: "-5px",
    backgroundColor: "#10b981",
    color: "white",
    fontSize: "10px",
    padding: "2px 6px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    border: "2px solid white",
  },
  chatWindow: {
    width: "380px",
    height: "550px",
    backgroundColor: "white",
    borderRadius: "16px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: "fadeIn 0.3s ease-out",
  },
  header: {
    backgroundColor: "#2563eb",
    padding: "15px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "white",
  },
  headerInfo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  avatarBot: {
    width: "35px",
    height: "35px",
    backgroundColor: "white",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  botName: {
    fontWeight: "bold",
    fontSize: "16px",
  },
  status: {
    fontSize: "11px",
    opacity: 0.9,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "5px",
    transition: "opacity 0.2s",
  },
  messagesArea: {
    flex: 1,
    padding: "15px",
    overflowY: "auto",
    backgroundColor: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  messageRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
  },
  msgAvatar: {
    width: "24px",
    height: "24px",
    backgroundColor: "#2563eb",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  botBubble: {
    backgroundColor: "white",
    color: "#334155",
    padding: "10px 14px",
    borderRadius: "14px",
    borderBottomLeftRadius: "2px",
    maxWidth: "80%",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
    fontSize: "14px",
    lineHeight: "1.5",
    whiteSpace: "pre-line",
  },
  userBubble: {
    backgroundColor: "#2563eb",
    color: "white",
    padding: "10px 14px",
    borderRadius: "14px",
    borderBottomRightRadius: "2px",
    maxWidth: "80%",
    fontSize: "14px",
    lineHeight: "1.5",
  },
  loadingBubble: {
    display: "flex",
    gap: "4px",
    padding: "12px",
    backgroundColor: "white",
    borderRadius: "14px",
    width: "fit-content",
  },
  dot: {
    width: "8px",
    height: "8px",
    backgroundColor: "#94a3b8",
    borderRadius: "50%",
    animation: "bounce 0.6s infinite alternate",
  },
  inputArea: {
    padding: "15px",
    backgroundColor: "white",
    borderTop: "1px solid #e2e8f0",
    display: "flex",
    gap: "10px",
  },
  input: {
    flex: 1,
    padding: "10px 15px",
    borderRadius: "20px",
    border: "1px solid #e2e8f0",
    outline: "none",
    fontSize: "14px",
    transition: "border-color 0.2s",
  },
  sendBtn: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: "#2563eb",
    border: "none",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s",
  },
};

export default DoctorChatbot;
