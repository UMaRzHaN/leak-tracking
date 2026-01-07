<<<<<<< Updated upstream
import { useEffect, useState } from "react";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
=======
import { useState, useEffect } from "react";
>>>>>>> Stashed changes
import {
  locations,
  objects,
  components,
  description,
  cause,
  solutions,
  recommendations,
  materials,
} from "../data/dictionaries";
import { normalizeNumber } from "../utils/calculations";
const REQUIRED_FIELDS = ["leak_id", "video_id", "leak_speed"];
const NUMBER_FIELDS = [
  "leak_id",
  "video_id",
  "leak_speed",
  "temperature",
  "pressure",
];
export default function LeakForm({
  onAdd,
  voiceData,
  clearVoiceData,
  onVoiceInput,
}) {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [activeField, setActiveField] = useState(null);
  const [listening, setListening] = useState(false);

  /* ===== helpers ===== */
  const handle = (key, value) => {
    const finalValue = NUMBER_FIELDS.includes(key)
      ? normalizeNumber(value)
      : value;

    setForm((prev) => ({
      ...prev,
      [key]: finalValue,
    }));

    // сразу чистим ошибку
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const bind = (key) => ({
    value: form[key] || "",
    onChange: (e) => handle(key, e.target.value),
    onFocus: () => setActiveField(key),
  });

  /* ===== VOICE ===== */
  const startVoice = async () => {
    if (!activeField) {
      alert("Выберите поле для диктовки");
      return;
    }

    const available = await SpeechRecognition.available();
    if (!available.available) {
      alert("Распознавание речи недоступно");
      return;
    }

    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") {
      alert("Нет доступа к микрофону");
      return;
    }

    await SpeechRecognition.removeAllListeners();
    setListening(true);

    SpeechRecognition.addListener("partialResults", (res) => {
      const text = res.matches?.join(" ") || "";
      handle(activeField, ((form[activeField] || "") + " " + text).trim());
    });

    SpeechRecognition.addListener("listeningState", (state) => {
      if (!state.listening) setListening(false);
    });

    await SpeechRecognition.start({
      language: "ru-RU",
      partialResults: true,
      popup: false,
    });
  };

  const stopVoice = async () => {
    setListening(false);
    await SpeechRecognition.stop();
    await SpeechRecognition.removeAllListeners();
  };

  useEffect(() => {
    return () => {
      SpeechRecognition.stop();
      SpeechRecognition.removeAllListeners();
    };
  }, []);

  /* ===== VALIDATION ===== */
  const validate = () => {
    const newErrors = {};

    REQUIRED_FIELDS.forEach((key) => {
      const value = form[key];

      if (value === "" || value === null || value === undefined) {
        newErrors[key] = "Обязательное числовое поле";
      } else if (NUMBER_FIELDS.includes(key) && typeof value !== "number") {
        newErrors[key] = "Введите число";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const add = () => {
    if (!validate()) return;
    onAdd({ ...form, date: new Date().toLocaleDateString() });
    setForm({});
    setErrors({});
    setActiveField(null);
  };
  useEffect(() => {
    if (voiceData) {
      setForm((prev) => ({ ...prev, ...voiceData }));
      clearVoiceData();
    }
  }, [voiceData, clearVoiceData]);

  /* ===== UI ===== */
  return (
<<<<<<< Updated upstream
    <div className="card" style={{ marginBottom: "40px" }}>
      {/* 🎤 VOICE PANEL */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginBottom: 10,
          gap: 20,
        }}
      >
        <button onClick={startVoice} disabled={listening}>
          🎤 {listening ? "Слушаю..." : "Диктовать"}
        </button>
        <button onClick={stopVoice}>⏹ Стоп</button>
        {activeField && <span> 🎯 {activeField}</span>}
      </div>

      {/* ===== ОБЯЗАТЕЛЬНЫЕ ===== */}
=======
    <div className="card">
      {/* 🎙 Голосовой ввод */}
      <button type="button" className="voice-button" onClick={onVoiceInput}>
        🎙️ Голосовой ввод
      </button>

      {/* Обязательные поля */}

      {/* Обязательные поля */}
>>>>>>> Stashed changes
      <input
        className="emojis"
        id="tag"
<<<<<<< Updated upstream
        placeholder="Индивидуальный номер утечки *"
        {...bind("leak_id")}
=======
        type="number"
        inputMode="numeric"
        className={`emojis ${errors.leak_id ? "input-error" : ""}`}
        placeholder="Индивидуальный номер утечки *"
        value={form.leak_id ?? ""}
        onChange={(e) => handle("leak_id", e.target.value)}
>>>>>>> Stashed changes
      />
      {errors.leak_id && <div className="error-text">{errors.leak_id}</div>}

      <input
        className="emojis"
        id="video"
<<<<<<< Updated upstream
        placeholder="Индивидуальный номер видео *"
        {...bind("video_id")}
=======
        type="number"
        inputMode="numeric"
        className={`emojis ${errors.video_id ? "input-error" : ""}`}
        placeholder="Индивидуальный номер утечки *"
        value={form.video_id ?? ""}
        onChange={(e) => handle("video_id", e.target.value)}
>>>>>>> Stashed changes
      />
      <input
        className="emojis"
        id="speed"
<<<<<<< Updated upstream
        placeholder="Скорость утечки *"
        {...bind("leak_speed")}
=======
        type="number"
        inputMode="decimal"
        step="any"
        className={`emojis ${errors.leak_speed ? "input-error" : ""}`}
        placeholder="Скорость утечки *"
        value={form.leak_speed ?? ""}
        onChange={(e) => handle("leak_speed", e.target.value)}
>>>>>>> Stashed changes
      />

      {/* ===== ПАРАМЕТРЫ ===== */}
      <input
        className="emojis"
        id="temperature"
<<<<<<< Updated upstream
        placeholder="Температура"
        {...bind("temperature")}
=======
        className="emojis"
        type="number"
        inputMode="numeric"
        placeholder="Температура"
        value={form.temperature ?? ""}
        onChange={(e) => handle("temperature", e.target.value)}
>>>>>>> Stashed changes
      />
      <input
        className="emojis"
<<<<<<< Updated upstream
        id="pressure"
        placeholder="Давление"
        {...bind("pressure")}
=======
        type="number"
        inputMode="numeric"
        placeholder="Давление"
        value={form.pressure ?? ""}
        onChange={(e) => handle("pressure", e.target.value)}
>>>>>>> Stashed changes
      />
      <input placeholder="УМГ" {...bind("field")} />
      <input placeholder="Компрессорная станция" {...bind("station")} />

      <textarea placeholder="Примечание" {...bind("note")} />

      {/* ===== СПРАВОЧНИКИ ===== */}
      <input
        list="locations-list"
        placeholder="Локация"
        {...bind("location")}
      />
      <datalist id="locations-list">
        {Object.values(locations)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input list="objects-list" placeholder="Объект" {...bind("object")} />
      <datalist id="objects-list">
        {Object.values(objects)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="components-list"
        placeholder="Компонент"
        {...bind("component")}
      />
      <datalist id="components-list">
        {Object.values(components)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="description-list"
        placeholder="Описание утечки"
        {...bind("leak_description")}
      />
      <datalist id="description-list">
        {Object.values(description)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="cause-list"
        placeholder="Причина утечки"
        {...bind("leak_cause")}
      />
      <datalist id="cause-list">
        {Object.values(cause)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="solutions-list"
        placeholder="Технологическое решение"
        {...bind("technological_solution")}
      />
      <datalist id="solutions-list">
        {Object.values(solutions)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="recommendations-list"
        placeholder="Решение / План устранения"
        {...bind("repair_recommendation")}
      />
      <datalist id="recommendations-list">
        {Object.values(recommendations)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <input
        list="materials-list"
        placeholder="МТР ремонта"
        {...bind("materials_equipment")}
      />
      <datalist id="materials-list">
        {Object.values(materials)
          .flat()
          .map((v, i) => (
            <option key={i} value={v} />
          ))}
      </datalist>

      <button onClick={add}>💾 Сохранить</button>
    </div>
  );
}
