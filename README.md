# Leak Tracking System

Веб/мобильное приложение для регистрации, анализа и управления утечками газа в рамках MRV-процессов и операционной эксплуатации.

## Назначение

Система предназначена для:
- регистрации утечек (Leak Detection)
- оценки потерь газа и выбросов метана
- приоритизации ремонта (экономика / риск)
- ведения статусов (активная / отложенная / устранена)
- формирования отчетности (включая экспорт в Excel)

## Основной функционал

- Геолокация утечек (Capacitor Geolocation)
- Фотофиксация (Camera API)
- Голосовой ввод (Speech Recognition)
- Отображение на карте (Google Maps + clustering)
- Экспорт данных (Excel / XLSX)
- Локальное хранение данных (Filesystem / localStorage)
- Редактирование карточек утечек (LeakDetailsSheet)

## Архитектура

- Frontend: React (Create React App)
- Mobile: Capacitor (Android)
- Карты: Google Maps JS API
- Данные: локальное хранилище

## Установка

npm install

## Запуск

npm start

## Сборка

npm run build

## Mobile

npx cap sync
npx cap open android

## Применение


