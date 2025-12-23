import { GoogleGenAI } from "@google/genai";
import { SensorData, DeviceState, AiDetection } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getGardenInsights = async (
  sensors: SensorData,
  devices: DeviceState,
  detection: AiDetection
): Promise<string> => {
  try {
    const prompt = `
      Analyze the following Smart Garden IoT data and provide a short, helpful insight or recommendation (max 2 sentences).
      Language: Vietnamese.
      
      Data:
      - Temperature: ${sensors.temperature}°C (Ideal: 22-30°C)
      - Air Humidity: ${sensors.humidity}% (Ideal: 50-70%)
      - Soil Moisture: ${sensors.soilMoisture}% (Ideal: 60-80%)
      - Light: ${sensors.lightLux} Lux (Ideal: >800 Lux for current crop)
      
      Devices:
      - Pump: ${devices.pump ? "ON" : "OFF"}
      - Lamp: ${devices.lamp ? "ON" : "OFF"}
      - Fan: ${devices.fan ? "ON" : "OFF"}
      
      AI Vision:
      - Detected: ${detection.count} plants
      - Types: ${detection.items.join(', ')}
      - Health Confidence: ${detection.confidence}%
      
      If soil moisture is low and pump is off, suggest watering. 
      If temp is high and fan is off, suggest cooling.
      Keep it professional yet friendly.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Hệ thống đang hoạt động ổn định.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Không thể kết nối với AI vào lúc này.";
  }
};
