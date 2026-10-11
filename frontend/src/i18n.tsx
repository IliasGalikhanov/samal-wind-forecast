import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export const messages = {
  stationSetup: ['Настройка станции', 'Станцияны баптау', 'Station setup'],
  stationSetupHint: [
    'Добавьте турбины и задайте их координаты. Погода будет запрашиваться для каждой точки.',
    'Турбиналарды қосып, координаттарын енгізіңіз. Ауа райы әр нүкте үшін сұратылады.',
    'Add turbines and their coordinates. Weather is requested for each location.',
  ],
  addTurbine: ['Добавить турбину', 'Турбина қосу', 'Add turbine'],
  editTurbine: ['Изменить турбину', 'Турбинаны өзгерту', 'Edit turbine'],
  turbineName: ['Название турбины', 'Турбина атауы', 'Turbine name'],
  latitude: ['Широта', 'Ендік', 'Latitude'],
  longitude: ['Долгота', 'Бойлық', 'Longitude'],
  sampleInterval: ['Интервал измерений', 'Өлшеу аралығы', 'Measurement interval'],
  ratedPower: ['Номинальная мощность · кВт', 'Номиналды қуат · кВт', 'Rated capacity · kW'],
  optionalField: ['Необязательно', 'Міндетті емес', 'Optional'],
  ratedPowerHint: [
    'Номинальная мощность нужна для импорта в кВт или МВт. Для долей 0–1 и процентов её можно не указывать.',
    'кВт немесе МВт импорттау үшін номиналды қуат қажет. 0–1 үлестері мен пайыздар үшін міндетті емес.',
    'Rated capacity is required for kW or MW imports. It is optional for 0–1 fractions and percentages.',
  ],
  stationLockedHint: [
    'Интервал и номинальная мощность зафиксированы после импорта, чтобы сохранить смысл загруженных измерений.',
    'Жүктелген өлшемдердің мағынасын сақтау үшін аралық пен номиналды қуат импорттан кейін бекітіледі.',
    'Interval and rated capacity are fixed after import to preserve the meaning of stored measurements.',
  ],
  saveStation: ['Сохранить турбину', 'Турбинаны сақтау', 'Save turbine'],
  savingStation: ['Сохраняем…', 'Сақталуда…', 'Saving…'],
  stationHasData: ['Данные загружены', 'Деректер жүктелді', 'Data imported'],
  stationNeedsData: ['Ожидает CSV', 'CSV күтілуде', 'Awaiting CSV'],
  stationEmpty: [
    'Сначала добавьте турбину с координатами.',
    'Алдымен координаттары бар турбинаны қосыңыз.',
    'Add a turbine with coordinates first.',
  ],
  minutes: ['{n} мин', '{n} мин', '{n} min'],
  turbineCount: ['Турбин: {n}', 'Турбиналар: {n}', 'Turbines: {n}'],
  setupWelcome: [
    'Начните со своей станции',
    'Өз станцияңыздан бастаңыз',
    'Start with your station',
  ],
  setupWelcomeHint: [
    'Укажите часовой пояс, добавьте турбины с координатами, затем импортируйте историю измерений.',
    'Уақыт белдеуін көрсетіңіз, координаттары бар турбиналарды қосыңыз, содан кейін өлшемдер тарихын импорттаңыз.',
    'Set the timezone, add turbines with coordinates, then import measurement history.',
  ],
  demoReadOnly: [
    'В демонстрации используются вымышленные данные. Для своих турбин, CSV и резервных копий откройте обычное приложение на порту 8080.',
    'Демонстрацияда ойдан шығарылған деректер қолданылады. Өз турбиналарыңыз, CSV және сақтық көшірмелер үшін 8080 портындағы негізгі қолданбаны ашыңыз.',
    'This demo uses invented data. Use the regular application on port 8080 for your turbines, CSV files and backups.',
  ],
  csvDelimiter: ['Разделитель CSV', 'CSV бөлгіші', 'CSV delimiter'],
  delimiterComma: ['Запятая', 'Үтір', 'Comma'],
  delimiterSemicolon: ['Точка с запятой', 'Нүктелі үтір', 'Semicolon'],
  delimiterTab: ['Табуляция', 'Табуляция', 'Tab'],
  chooseColumn: ['Выберите столбец', 'Бағанды таңдаңыз', 'Choose column'],
  powerUnits: ['Единицы мощности в файле', 'Файлдағы қуат бірліктері', 'Power units in the file'],
  mappingHint: [
    'Сопоставьте четыре столбца. Время: ГГГГ-ММ-ДД ЧЧ:ММ:СС в часовом поясе станции; ветер: м/с; температура: °C. Остальные столбцы не участвуют в расчёте.',
    'Төрт бағанды сәйкестендіріңіз. Уақыт: станция белдеуінде ЖЖЖЖ-АА-КК СС:ММ:СС; жел: м/с; температура: °C. Басқа бағандар есептеуге қатыспайды.',
    'Map four columns. Time: YYYY-MM-DD HH:MM:SS in the station timezone; wind: m/s; temperature: °C. Other columns are excluded from calculation.',
  ],
  timezoneInputHint: [
    'Часовой пояс IANA, например Asia/Almaty или UTC. Все CSV станции должны использовать его. Для данных с переводом часов используйте UTC.',
    'IANA уақыт белдеуі, мысалы Asia/Almaty немесе UTC. Станцияның барлық CSV файлдары осы белдеуді қолдануы керек. Сағат ауыстыруы бар деректер үшін UTC қолданыңыз.',
    'IANA timezone, e.g. Asia/Almaty or UTC. All station CSV files must use it. Use UTC for data spanning daylight saving changes.',
  ],
  timezoneLocked: [
    'Часовой пояс зафиксирован после импорта. Приводите новые CSV к этому поясу.',
    'Уақыт белдеуі импорттан кейін бекітілген. Жаңа CSV файлдарын осы белдеуге келтіріңіз.',
    'Timezone is fixed after import. Convert new CSV files to this timezone.',
  ],

  demoBanner: [
    'Деморежим: измерения и погода синтетические. Метрики не показывают точность на реальной ВЭС. Импорт своих данных доступен в обычном приложении.',
    'Демо режимі: өлшемдер мен ауа райы синтетикалық. Метрикалар нақты ЖЭС дәлдігін көрсетпейді. Өз деректеріңізді негізгі қолданбада импорттаңыз.',
    'Demo: measurements and weather are synthetic. Metrics do not measure real wind farm accuracy. Import your own data in the regular application.',
  ],
  syntheticSource: [
    'Синтетическая погода · SAMAL',
    'Синтетикалық ауа райы · SAMAL',
    'Synthetic weather · SAMAL',
  ],
  syntheticLabel: ['Демонстрация', 'Демонстрация', 'Demonstration'],
  modelReused: [
    'Использована сохранённая модель. Обучение не запускалось.',
    'Сақталған модель қолданылды. Оқыту іске қосылмады.',
    'Saved model reused. No training was run.',
  ],
  modelTraining: [
    'Обучение новой версии модели',
    'Модельдің жаңа нұсқасын оқыту',
    'Training a new model version',
  ],
  modelCacheInvalid: [
    'Сохранённая модель повреждена: запускается переобучение',
    'Сақталған модель бүлінген: қайта оқыту басталады',
    'Saved model is invalid: retraining',
  ],
  modelTrained: [
    'Модель обучена для этой версии данных',
    'Модель деректердің осы нұсқасына оқытылды',
    'Model trained for this data version',
  ],
  weatherSettings: [
    'Погода и автоматический цикл',
    'Ауа райы және автоматты цикл',
    'Weather and automatic cycle',
  ],
  weatherSettingsDesc: [
    'Погода по координатам ваших турбин и расписание расчётов.',
    'Турбиналарыңыздың координаттары бойынша ауа райы және есептеу кестесі.',
    'Weather for your turbine coordinates and the calculation schedule.',
  ],
  weatherEnabled: [
    'Использовать внешние прогнозы погоды',
    'Сыртқы ауа райы болжамдарын пайдалану',
    'Use external weather forecasts',
  ],
  csvTimezone: ['Часовой пояс CSV', 'CSV уақыт белдеуі', 'CSV timezone'],
  timezoneAssumption: [
    'Измерения и прогноз приведены ко времени станции.',
    'Өлшемдер мен болжам станция уақытына келтірілген.',
    'Measurements and forecasts use the station timezone.',
  ],
  weatherOriginMode: [
    'Начало прогноза по умолчанию',
    'Болжамның әдепкі басталуы',
    'Default forecast origin',
  ],
  datasetOrigin: [
    'После последних измерений · исторический режим',
    'Соңғы өлшемдерден кейін · тарихи режим',
    'After latest measurements · historical mode',
  ],
  liveOrigin: [
    'Следующий час от текущего времени',
    'Ағымдағы уақыттан кейінгі сағат',
    'Next hour from the current time',
  ],
  weatherAutoRefresh: [
    'Обновлять текущий прогноз каждые 6 часов',
    'Ағымдағы болжамды әр 6 сағат сайын жаңарту',
    'Refresh live forecasts every 6 hours',
  ],
  weatherAutoHint: [
    'Автообновление действует в режиме текущего времени, пока сервер SAMAL запущен. Импорт новых измерений может запустить расчёт в любом режиме.',
    'Автоматты жаңарту SAMAL сервері жұмыс істеп тұрғанда ағымдағы уақыт режимінде орындалады. Жаңа өлшемдерді импорттау кез келген режимде есептеуді бастай алады.',
    'Auto-refresh runs in live mode while the SAMAL server is running. Importing new measurements can trigger a run in either mode.',
  ],
  saveWeather: ['Сохранить настройки', 'Баптауларды сақтау', 'Save settings'],
  weatherSaved: ['Сохранено', 'Сақталды', 'Saved'],
  weatherInputs: [
    'Погода, использованная в прогнозе',
    'Болжамда қолданылған ауа райы',
    'Weather used by this forecast',
  ],
  forecastMode: ['Режим расчёта', 'Есептеу режимі', 'Forecast mode'],
  modeLive: ['Ближайшие часы', 'Алдағы сағаттар', 'Upcoming hours'],
  modeHistorical: ['Исторический расчёт', 'Тарихи есептеу', 'Historical forecast'],
  liveModeHint: [
    'Прогноз с ближайшего полного часа, Asia/Almaty.',
    'Келесі толық сағаттан бастап, Asia/Almaty.',
    'Starts at the next full hour, Asia/Almaty.',
  ],
  historicalModeHint: [
    'Пустое поле — следующий час после последних измерений.',
    'Бос өріс — соңғы өлшемдерден кейінгі сағат.',
    'Leave blank to start after the last measurements.',
  ],
  liveWeatherNote: [
    'Получен актуальный прогноз погоды Open-Meteo. Снимок входных данных сохранён вместе с результатом.',
    'Open-Meteo ағымдағы ауа райы болжамы алынды. Кіріс деректері нәтижемен бірге сақталды.',
    'Latest Open-Meteo forecast received. A snapshot of the inputs is saved with this result.',
  ],
  agentDecisions: ['Решения агента', 'Агент шешімдері', 'Agent decisions'],
  decisionStale: [
    'нет свежих измерений; резерв выбран по временной валидации',
    'жаңа өлшемдер жоқ; балама уақыттық тексеру арқылы таңдалды',
    'no recent measurements; fallback selected by temporal validation',
  ],
  decisionFresh: [
    'свежие измерения доступны; модель выбрана по временной валидации',
    'жаңа өлшемдер бар; модель уақыттық тексеру арқылы таңдалды',
    'recent measurements available; model selected by temporal validation',
  ],
  decisionValidated: [
    'Проверены все часы, турбины и диапазон мощности 0–100%.',
    'Барлық сағаттар, турбиналар және 0–100% қуат ауқымы тексерілді.',
    'All hours, turbines and the 0–100% power range were checked.',
  ],
  liveFetchStage: [
    'Получение актуального прогноза погоды',
    'Ағымдағы ауа райы болжамын алу',
    'Fetching the latest weather forecast',
  ],
  routeStage: [
    'Турбина {n}: {model} · {reason}',
    'Турбина {n}: {model} · {reason}',
    'Turbine {n}: {model} · {reason}',
  ],
  weatherArchived: [
    'Прогнозы по координатам',
    'Координаттар бойынша болжамдар',
    'Forecasts by coordinates',
  ],
  weatherMargin: ['Запас на публикацию', 'Жариялау уақытына қор', 'Publication margin'],
  weatherBoundNote: [
    'Точное время выпуска API не предоставляет.',
    'API нақты шығарылым уақытын бермейді.',
    'The API does not supply exact issue timestamps.',
  ],
  weatherWindHeight: [
    'Высота погодного прогноза ветра',
    'Жел болжамының биіктігі',
    'Forecast wind height',
  ],
  meters: ['м', 'м', 'm'],
  hoursShort: ['ч', 'сағ', 'h'],
  weatherHeightNote: [
    'Высота ротора в исходных данных не указана.',
    'Бастапқы деректерде ротор биіктігі көрсетілмеген.',
    'Rotor height is not specified in the source data.',
  ],
  weatherInputNote: [
    'Использованы прогнозные ветер, направление ветра и температура. Заблаговременность выбрана для каждого часа с запасом 12 часов до момента расчёта.',
    'Болжамды жел, жел бағыты және температура қолданылды. Әр сағат үшін есептеу сәтіне дейін 12 сағаттық қор ескерілді.',
    'Forecast wind, wind direction and temperature are used. Each target hour uses a lead-time offset with a 12-hour margin before the forecast origin.',
  ],
  weatherManifest: [
    'Источник и параметры · JSON',
    'Дереккөз және параметрлер · JSON',
    'Source and parameters · JSON',
  ],
  weatherValues: ['Посмотреть погодные значения', 'Ауа райы мәндерін көру', 'View weather values'],
  weatherForecastAge: [
    'Заблаговременность погоды',
    'Ауа райының болжам мерзімі',
    'Weather lead time',
  ],
  weatherRetrieved: ['Загружено', 'Жүктелген', 'Retrieved'],
  replayReady: [
    'Ежедневные прогнозы: {n} дней',
    'Күнделікті болжамдар: {n} күн',
    'Daily forecasts: {n} days',
  ],
  replayMethod: [
    'Измерения зафиксированы на конце исходной истории. При их устаревании применяется выбранная модель без свежих измерений:',
    'Өлшемдер бастапқы тарихтың соңында бекітілген. Олар ескіргенде жаңа өлшемдерсіз таңдалған модель қолданылады:',
    'Measurements are frozen at the end of the source history. Stale inputs use the selected model that needs no fresh readings:',
  ],
  replayDownload: [
    'Скачать весь период · CSV',
    'Толық кезеңді жүктеу · CSV',
    'Download full period · CSV',
  ],
  replayRun: [
    'Рассчитать 28 ежедневных прогнозов',
    '28 күнделікті болжамды есептеу',
    'Calculate 28 daily forecasts',
  ],
  weatherForecastNote: [
    'Прогноз использует внешние погодные данные. Точность на будущих измерениях ещё не подтверждена.',
    'Болжам сыртқы ауа райы деректерін пайдаланады. Болашақ өлшемдердегі дәлдік әлі расталмаған.',
    'This forecast uses external weather data. Accuracy on future measurements remains unconfirmed.',
  ],
  weatherStale: [
    'Турбина {n}: свежих измерений нет. Использована модель {model}.',
    'Турбина {n}: жаңа өлшемдер жоқ. {model} моделі қолданылды.',
    'Turbine {n}: fresh measurements are unavailable. Model: {model}.',
  ],
  weatherHybridModel: [
    'CatBoost · погода и история',
    'CatBoost · ауа райы және тарих',
    'CatBoost · weather and history',
  ],
  weatherOnlyModel: ['CatBoost · погода', 'CatBoost · ауа райы', 'CatBoost · weather'],
  weatherPlan: [
    'Подготовка погодных входов и истории для обучения',
    'Оқыту үшін ауа райы деректері мен тарихты дайындау',
    'Preparing weather inputs and history for training',
  ],
  weatherFetch: [
    'Получение погоды: блок {n} из {total}',
    'Ауа райын жүктеу: {total} ішінен {n} бөлік',
    'Retrieving weather: block {n} of {total}',
  ],
  weatherFeatures: [
    'Совмещение архивных прогнозов с историей турбин',
    'Мұрағаттық болжамдарды турбина тарихымен біріктіру',
    'Joining archived forecasts with turbine history',
  ],
  weatherValidation: [
    'Временная проверка {n}/4: модели с погодой и без неё',
    'Уақыттық тексеру {n}/4: ауа райы бар және жоқ модельдер',
    'Temporal fold {n}/4: models with and without weather',
  ],
  weatherSelection: [
    'Выбрана {model}; без свежих измерений — {fallback}',
    'Таңдалған: {model}; жаңа өлшемдерсіз — {fallback}',
    'Selected {model}; without fresh readings: {fallback}',
  ],
  weatherFinal: [
    'Обучение итоговых моделей на доступной истории',
    'Қолжетімді тарих бойынша қорытынды модельдерді оқыту',
    'Training final models on available history',
  ],
  weatherForecastStage: [
    'Формирование ежедневного прогноза {n}/{total}',
    'Күнделікті болжамды қалыптастыру {n}/{total}',
    'Producing daily forecast {n}/{total}',
  ],
  weatherAnalysis: [
    'Проверка границ, полноты и результатов сравнения',
    'Шектерді, толықтықты және салыстыру нәтижелерін тексеру',
    'Checking bounds, completeness and model comparisons',
  ],
  weatherRetry: [
    'Повторное обращение к погодному источнику · {n}',
    'Ауа райы көзіне қайта сұрау · {n}',
    'Retrying weather source · {n}',
  ],

  rollingValidation: [
    'Выбор по четырём временным проверкам',
    'Төрт уақыттық тексеру бойынша таңдау',
    'Selection across four temporal folds',
  ],
  rollingTraining: [
    'Обучение перед каждым отрезком',
    'Әр кезең алдында оқыту',
    'Training before each fold',
  ],
  rollingStage: [
    'Временная валидация {n}/4: обучение двух вариантов CatBoost',
    'Уақыттық валидация {n}/4: екі CatBoost нұсқасын оқыту',
    'Temporal validation {n}/4: training two CatBoost variants',
  ],
  rollingNote: [
    'Для каждого отрезка модель обучалась заново только на предшествующих данных. Выбор сделан по общей MAE всех четырёх отрезков для запрошенного горизонта.',
    'Әр кезеңде модель тек алдыңғы деректерде қайта оқытылды. Таңдау сұралған болжам кезеңі үшін төрт тексерудің жалпы MAE мәні бойынша жасалды.',
    'Each fold retrains only on preceding data. Selection uses pooled MAE across all four folds for the requested horizon.',
  ],
  auditReuse: [
    'Этот исторический тест уже анализировался при разработке. Подтверждение качества требует новых фактических измерений.',
    'Бұл тарихи тест әзірлеу кезінде талданған. Сапаны растау үшін жаңа нақты өлшемдер қажет.',
    'This historical test has already been examined during development. Confirming quality requires new actual measurements.',
  ],
  baselineForecast: [
    'Здесь используется базовый прогноз: {model}. Он не подтверждает точность на будущих измерениях.',
    'Мұнда базалық болжам қолданылады: {model}. Ол болашақ өлшемдердегі дәлдікті растамайды.',
    'This is a baseline forecast: {model}. It does not establish accuracy on future measurements.',
  ],
  markOne: ['Отметить прочитанным', 'Оқылған деп белгілеу', 'Mark as read'],
  overview: ['Обзор станции', 'Станцияға шолу', 'Station overview'],
  forecast: ['Прогноз мощности', 'Қуат болжамы', 'Power forecast'],
  import: ['Импорт данных', 'Деректерді импорттау', 'Import data'],
  quality: ['Качество модели', 'Модель сапасы', 'Model quality'],
  agent: ['Журнал агента', 'Агент журналы', 'Agent activity'],
  compare: ['Сравнение прогнозов', 'Болжамдарды салыстыру', 'Compare forecasts'],
  settings: ['Настройки', 'Баптаулар', 'Settings'],
  notifications: ['Уведомления', 'Хабарландырулар', 'Notifications'],
  overviewDesc: [
    'История измерений и следующий горизонт прогноза.',
    'Өлшемдер тарихы және келесі болжам кезеңі.',
    'Measurement history and the next forecast horizon.',
  ],
  forecastDesc: [
    'Почасовая мощность по прогнозу погоды на ближайшие 24–48 часов.',
    'Алдағы 24–48 сағатқа ауа райы бойынша сағаттық қуат болжамы.',
    'Hourly power from the weather forecast for the next 24–48 hours.',
  ],
  importDesc: [
    'Проверьте файл и добавьте новые измерения.',
    'Файлды тексеріп, жаңа өлшемдерді қосыңыз.',
    'Preview your file and add new measurements.',
  ],
  qualityDesc: [
    'Честная проверка на последовательных временных отрезках.',
    'Бірізді уақыт кезеңдеріндегі тексеру.',
    'Evaluation across consecutive time periods.',
  ],
  agentDesc: [
    'Каждый запуск, этап и результат в одном месте.',
    'Әр іске қосу, кезең және нәтиже бір жерде.',
    'Every run, stage and result in one place.',
  ],
  compareDesc: [
    'Две версии на одинаковых часах и одной турбине.',
    'Бір турбинаның бірдей сағаттардағы екі нұсқасы.',
    'Two versions, the same target hours and turbine.',
  ],
  settingsDesc: [
    'Ваше рабочее пространство — под ваши привычки.',
    'Жұмыс кеңістігін өзіңізге ыңғайлаңыз.',
    'Make this workspace your own.',
  ],
  notificationsDesc: [
    'События приложения сохраняются на этом устройстве.',
    'Қолданба оқиғалары осы құрылғыда сақталады.',
    'Application events are saved on this device.',
  ],
  windEnergy: ['ЭНЕРГИЯ ВЕТРА', 'ЖЕЛ ЭНЕРГИЯСЫ', 'WIND ENERGY'],
  station: ['Ветровая станция', 'Жел станциясы', 'Wind station'],
  twoTurbines: ['Две турбины · Казахстан', 'Екі турбина · Қазақстан', 'Two turbines · Kazakhstan'],
  workspace: ['РАБОЧЕЕ ПРОСТРАНСТВО', 'ЖҰМЫС КЕҢІСТІГІ', 'WORKSPACE'],
  local: ['Локальный режим', 'Жергілікті режим', 'Local mode'],
  localData: ['Данные на вашем устройстве', 'Деректер құрылғыңызда', 'Data on your device'],
  help: ['О данных и методе', 'Деректер мен әдіс туралы', 'Data & methodology'],
  menu: ['Открыть меню', 'Мәзірді ашу', 'Open menu'],
  close: ['Закрыть', 'Жабу', 'Close'],
  skip: ['К содержимому', 'Мазмұнға өту', 'Skip to content'],
  calculate: ['Рассчитать прогноз', 'Болжамды есептеу', 'Calculate forecast'],
  calculating: ['Идёт расчёт', 'Есептелуде', 'Calculating'],
  upload: ['Загрузить данные', 'Деректерді жүктеу', 'Upload data'],
  csv: ['Скачать CSV', 'CSV жүктеп алу', 'Download CSV'],
  template: ['Шаблон CSV', 'CSV үлгісі', 'CSV template'],
  retry: ['Повторить', 'Қайталау', 'Retry'],
  loading: ['Загрузка…', 'Жүктелуде…', 'Loading…'],
  cancel: ['Отменить', 'Болдырмау', 'Cancel'],
  cancelling: ['Отменяем расчёт…', 'Есептеу тоқтатылуда…', 'Cancelling run…'],
  cancelled: ['Отменён', 'Тоқтатылды', 'Cancelled'],
  completed: ['Готов', 'Дайын', 'Completed'],
  failed: ['Ошибка', 'Қате', 'Failed'],
  running: ['В работе', 'Орындалуда', 'Running'],
  all: ['Все', 'Барлығы', 'All'],
  open: ['Открыть', 'Ашу', 'Open'],
  details: ['Подробнее', 'Толығырақ', 'Details'],
  empty: ['Пока нет данных', 'Әзірге деректер жоқ', 'No data yet'],
  noMatches: [
    'Ничего не найдено. Измените фильтры.',
    'Ештеңе табылмады. Сүзгілерді өзгертіңіз.',
    'No results. Try different filters.',
  ],
  resetFilters: ['Сбросить фильтры', 'Сүзгілерді тазарту', 'Reset filters'],
  turbines: ['Турбины станции', 'Станция турбиналары', 'Station turbines'],
  turbine: ['Турбина {n}', 'Турбина {n}', 'Turbine {n}'],
  turbineLabel: ['Турбина', 'Турбина', 'Turbine'],
  measurements: ['Измерения', 'Өлшемдер', 'Measurements'],
  completeness: ['Полнота временной сетки', 'Уақыт торының толықтығы', 'Timeline completeness'],
  missing: ['{n} отсутствующих интервалов', '{n} интервал жоқ', '{n} missing intervals'],
  perTurbine: [
    'Отдельный прогноз для каждой',
    'Әрқайсысына жеке болжам',
    'An individual forecast for each',
  ],
  testMAE: ['Ошибка на тесте · MAE', 'Тест қатесі · MAE', 'Test error · MAE'],
  pp: ['п.п.', 'п.т.', 'pp'],
  afterRun: ['Появится после расчёта', 'Есептеуден кейін көрсетіледі', 'Available after a run'],
  powerTime: ['Мощность во времени', 'Уақыт бойынша қуат', 'Power over time'],
  actual: ['Факт', 'Нақты', 'Actual'],
  predicted: ['Прогноз', 'Болжам', 'Forecast'],
  power: ['Мощность', 'Қуат', 'Power'],
  wind: ['Ветер', 'Жел', 'Wind'],
  temperature: ['Температура', 'Температура', 'Temperature'],
  ms: ['м/с', 'м/с', 'm/s'],
  hours: ['{n} ч', '{n} сағ', '{n} h'],
  nextHours: ['Следующие {n} часов', 'Келесі {n} сағат', 'The next {n} hours'],
  forecastReady: ['Расчёт завершён', 'Есептеу аяқталды', 'Calculation complete'],
  firstRun: ['Запустите первый расчёт', 'Алғашқы есептеуді іске қосыңыз', 'Start your first run'],
  meanPower: [
    'Средняя нормализованная мощность',
    'Орташа нормаланған қуат',
    'Mean normalized power',
  ],
  model: ['Модель', 'Модель', 'Model'],
  horizon: ['Горизонт', 'Болжам кезеңі', 'Horizon'],
  lastReading: ['Последнее измерение', 'Соңғы өлшем', 'Latest measurement'],
  last24: [
    'Последние 24 часа и следующий прогноз',
    'Соңғы 24 сағат және келесі болжам',
    'The last 24 hours and next forecast',
  ],
  history: ['История наблюдений', 'Бақылау тарихы', 'Observation history'],
  historyGaps: [
    'Неполные часы показаны разрывами.',
    'Толық емес сағаттар үзіліс ретінде көрсетілген.',
    'Incomplete hours appear as gaps.',
  ],
  days: ['Последние {n} дней', 'Соңғы {n} күн', 'Last {n} days'],
  unitsNote: [
    'Прогноз показан в нормализованных процентах. При импорте кВт и МВт делятся на указанную номинальную мощность.',
    'Болжам нормаланған пайыздарда көрсетілген. Импорттау кезінде кВт пен МВт көрсетілген номиналды қуатқа бөлінеді.',
    'Forecasts show normalized percentages. Imported kW and MW are divided by the specified rated capacity.',
  ],
  weatherNote: [
    'На основе истории, без внешнего прогноза погоды.',
    'Тарихқа негізделген, сыртқы ауа райы болжамы қолданылмайды.',
    'Based on history, without an external weather forecast.',
  ],
  sourceTime: [
    'Время CSV · пояс задаётся в настройках',
    'CSV уақыты · белдеуі баптауларда',
    'CSV time · timezone set in settings',
  ],
  stale: ['Исторические данные', 'Тарихи деректер', 'Historical data'],
  fresh: ['Свежие данные', 'Жаңа деректер', 'Recent data'],
  age: [
    'Возраст данных: около {n} дней',
    'Деректер жасы: шамамен {n} күн',
    'Data age: approximately {n} days',
  ],
  ageNote: [
    'Возраст данных показан приблизительно. В режиме «Ближайшие часы» прогноз начинается со следующего полного часа по времени станции.',
    'Деректер жасы шамамен көрсетілген. «Алдағы сағаттар» режиміндегі болжам станция уақыты бойынша келесі толық сағаттан басталады.',
    'Data age is approximate. Live forecasts start at the next full hour in the station timezone.',
  ],
  noData: [
    'Измерений пока нет. Импортируйте CSV.',
    'Өлшемдер әлі жоқ. CSV импорттаңыз.',
    'No measurements yet. Import a CSV.',
  ],
  origin: ['Начало прогноза', 'Болжамның басталуы', 'Forecast start'],
  originHint: [
    'По умолчанию — начало из настроек: после измерений или текущего времени.',
    'Әдепкі басталу баптауларға байланысты: өлшемдерден немесе ағымдағы уақыттан кейін.',
    'Default origin follows settings: after measurements or the current time.',
  ],
  seasonalHint: [
    'Без свежих измерений используется сезонный профиль.',
    'Жаңа өлшемдер болмаса, маусымдық профиль қолданылады.',
    'A seasonal profile is used when recent measurements are unavailable.',
  ],
  version: ['Версия от {date}', '{date} нұсқасы', 'Version from {date}'],
  latest: ['К последней версии', 'Соңғы нұсқаға', 'Latest version'],
  hourly: ['Почасовая мощность', 'Сағаттық қуат', 'Hourly power'],
  values: ['Значения прогноза', 'Болжам мәндері', 'Forecast values'],
  dateHour: ['Дата и час', 'Күн мен сағат', 'Date & hour'],
  source: ['Источник', 'Дереккөз', 'Source'],
  factPending: [
    'Факт за период прогноза ещё не загружен. После импорта появится измеренная ошибка.',
    'Болжам кезеңінің нақты өлшемдері әлі жүктелмеген. Импорттан кейін қате көрсетіледі.',
    'Actual measurements for this forecast are not uploaded yet. Measured error will appear after import.',
  ],
  evaluated: [
    'Факт: {matched} из {total} · MAE {mae} п.п. · RMSE {rmse} п.п.',
    'Нақты: {total} ішінен {matched} · MAE {mae} п.т. · RMSE {rmse} п.т.',
    'Actual: {matched} of {total} · MAE {mae} pp · RMSE {rmse} pp',
  ],
  staleTurbine: [
    'Турбина {n}: последние полные данные от {date}. Использован сезонный профиль.',
    'Турбина {n}: соңғы толық дерек {date}. Маусымдық профиль қолданылды.',
    'Turbine {n}: last complete data from {date}. A seasonal profile was used.',
  ],
  newMeasurements: ['Новые измерения', 'Жаңа өлшемдер', 'New measurements'],
  csvHint: [
    'CSV в UTF-8 · свои названия столбцов · до 50 МБ',
    'UTF-8 CSV · өз баған атаулары · 50 МБ дейін',
    'UTF-8 CSV · custom column names · up to 50 MB',
  ],
  autoRun: [
    'Рассчитать прогноз после импорта',
    'Импорттан кейін болжамды есептеу',
    'Calculate a forecast after import',
  ],
  drop: ['Перетащите файл сюда', 'Файлды осында сүйреңіз', 'Drop a file here'],
  choose: ['Выбрать на устройстве', 'Құрылғыдан таңдау', 'Choose from device'],
  preview: ['Проверить файл', 'Файлды тексеру', 'Preview file'],
  previewing: ['Проверяем файл…', 'Файл тексерілуде…', 'Checking file…'],
  importAction: ['Импортировать', 'Импорттау', 'Import'],
  importing: ['Сохраняем измерения…', 'Өлшемдер сақталуда…', 'Saving measurements…'],
  duplicatesHint: [
    'Совпадающие записи будут пропущены. Конфликты блокируют импорт.',
    'Бірдей жазбалар өткізіледі. Қайшылықтар болса, импорт тоқтатылады.',
    'Matching records are skipped. Conflicting values block the import.',
  ],
  previewTitle: ['Предварительная проверка', 'Алдын ала тексеру', 'Import preview'],
  new: ['Новые', 'Жаңа', 'New'],
  duplicate: ['Дубликаты', 'Қайталанған', 'Duplicates'],
  conflict: ['Конфликты', 'Қайшылықтар', 'Conflicts'],
  rows: ['Строки', 'Жолдар', 'Rows'],
  period: ['Период', 'Кезең', 'Period'],
  firstRows: ['Первые 5 строк', 'Алғашқы 5 жол', 'First 5 rows'],
  conflictHint: [
    'Исправьте значения или проверьте выбранную турбину. Ничего не сохранено.',
    'Мәндерді түзетіңіз немесе таңдалған турбинаны тексеріңіз. Ештеңе сақталмады.',
    'Correct the values or check the selected turbine. Nothing has been saved.',
  ],
  previewHint: [
    'При сохранении проверка повторяется, чтобы учесть изменения данных.',
    'Деректердегі өзгерістерді ескеру үшін сақтау кезінде тексеру қайталанады.',
    'The file is checked again on import to account for changes in stored data.',
  ],
  fileProcessed: ['Файл обработан', 'Файл өңделді', 'File processed'],
  importResult: [
    'Добавлено: {added} · дубликаты: {duplicates}',
    'Қосылды: {added} · қайталанған: {duplicates}',
    'Added: {added} · duplicates: {duplicates}',
  ],
  imported: ['Данные импортированы', 'Деректер импортталды', 'Data imported'],
  uploadHistory: ['История загрузок', 'Жүктеу тарихы', 'Upload history'],
  file: ['Файл', 'Файл', 'File'],
  added: ['Добавлено', 'Қосылды', 'Added'],
  uploaded: ['Загружен', 'Жүктелген', 'Uploaded'],
  dataStatus: ['Состояние данных', 'Деректер күйі', 'Data status'],
  nextSteps: ['Что произойдёт дальше', 'Әрі қарай не болады', 'What happens next'],
  checkFile: [
    'Сопоставьте столбцы, единицы мощности и проверьте значения перед импортом.',
    'Бағандар мен қуат бірліктерін сәйкестендіріп, импорт алдында мәндерді тексеріңіз.',
    'Map columns and power units, then review values before import.',
  ],
  updateHistory: [
    'Добавление новых записей без перезаписи истории.',
    'Тарихты өзгертпей, жаңа жазбаларды қосу.',
    'Add new records while preserving history.',
  ],
  runModels: [
    'Сравнение моделей и сохранение нового прогноза.',
    'Модельдерді салыстыру және жаңа болжамды сақтау.',
    'Compare models and save a new forecast.',
  ],
  minimumHistory: [
    'Для погодной модели нужно около 100 полных дней общей истории всех загруженных турбин после января 2024.',
    'Ауа райы моделі үшін 2024 жылғы қаңтардан кейінгі барлық жүктелген турбиналардың шамамен 100 толық күндік ортақ тарихы қажет.',
    'The weather model needs about 100 complete days shared by all imported turbines after January 2024.',
  ],
  search: ['Поиск', 'Іздеу', 'Search'],
  status: ['Статус', 'Күй', 'Status'],
  sort: ['Сортировка', 'Сұрыптау', 'Sort'],
  newest: ['Сначала новые', 'Алдымен жаңалары', 'Newest first'],
  oldest: ['Сначала старые', 'Алдымен ескілері', 'Oldest first'],
  mostAdded: ['Больше новых записей', 'Ең көп жаңа жазба', 'Most new records'],
  from: ['С даты', 'Басталу күні', 'From date'],
  to: ['По дату', 'Аяқталу күні', 'To date'],
  prev: ['Назад', 'Артқа', 'Previous'],
  next: ['Далее', 'Келесі', 'Next'],
  page: [
    'Страница {page} из {pages} · всего {total}',
    '{pages} беттің {page}-беті · барлығы {total}',
    'Page {page} of {pages} · {total} total',
  ],
  pageSize: ['Строк на странице', 'Беттегі жолдар', 'Rows per page'],
  training: ['Обучение', 'Оқыту', 'Training'],
  validation: ['Выбор модели', 'Модельді таңдау', 'Model selection'],
  test: ['Исторический тест', 'Тарихи тест', 'Historical test'],
  trainUntil: ['До {date}', '{date} дейін', 'Before {date}'],
  mae: ['Средняя абсолютная ошибка', 'Орташа абсолютті қате', 'Mean absolute error'],
  rmse: ['Среднеквадратичная ошибка', 'Орташа квадраттық қате', 'Root mean squared error'],
  lowerBetter: ['Ниже — лучше', 'Неғұрлым төмен болса, соғұрлым жақсы', 'Lower is better'],
  checked: ['Проверенные прогнозы', 'Тексерілген болжамдар', 'Evaluated forecasts'],
  targetPairs: [
    'Пары «запуск — целевой час»',
    '«Іске қосу — мақсатты сағат» жұптары',
    'Run–target hour pairs',
  ],
  actualVsForecast: ['Прогноз рядом с фактом', 'Болжам мен нақты мән', 'Forecast vs actual'],
  first24: [
    'Первые 24 часа каждого суточного запуска на тесте',
    'Тесттегі әр тәуліктік есептеудің алғашқы 24 сағаты',
    'First 24 hours of each daily test run',
  ],
  models: ['Сравнение моделей', 'Модельдерді салыстыру', 'Model comparison'],
  selected: ['Выбрана', 'Таңдалды', 'Selected'],
  validationMAE: ['Валидация MAE', 'Валидация MAE', 'Validation MAE'],
  testRMSE: ['Тест RMSE', 'Тест RMSE', 'Test RMSE'],
  modelNote: [
    'Ошибки в процентных пунктах. Модель выбирается по валидации; тест не используется для выбора.',
    'Қателер пайыздық тармақпен берілген. Модель валидация бойынша таңдалады; тест таңдау үшін қолданылмайды.',
    'Errors are in percentage points. Selection uses validation data; the test is not used for selection.',
  ],
  breakdown: ['По горизонтам', 'Болжам кезеңдері бойынша', 'By horizon'],
  persistence: ['Последнее измерение', 'Соңғы өлшем', 'Last measurement'],
  seasonal: ['Сезонный профиль', 'Маусымдық профиль', 'Seasonal profile'],
  catboost: ['CatBoost', 'CatBoost', 'CatBoost'],
  runHistory: ['История расчётов', 'Есептеулер тарихы', 'Run history'],
  run: ['Расчёт', 'Есептеу', 'Run'],
  manual: ['Вручную', 'Қолмен', 'Manual'],
  automatic: ['После импорта', 'Импорттан кейін', 'After import'],
  stages: ['Этапы расчёта', 'Есептеу кезеңдері', 'Run stages'],
  snapshot: [
    'Подготовка снимка данных',
    'Деректер көшірмесін дайындау',
    'Preparing a data snapshot',
  ],
  snapshotSaved: [
    'Создана версия входных данных',
    'Кіріс деректерінің нұсқасы жасалды',
    'Input snapshot created',
  ],
  featureStage: [
    'Проверка полноты часов и подготовка признаков',
    'Сағат толықтығын тексеру және белгілерді дайындау',
    'Checking hourly coverage and preparing features',
  ],
  trainingStage: [
    'Обучение CatBoost на данных до периода проверки',
    'Тексеру кезеңіне дейінгі деректерде CatBoost оқыту',
    'Training CatBoost on data preceding validation',
  ],
  validationStage: [
    'Сравнение моделей на 14 днях валидации',
    '14 күндік валидацияда модельдерді салыстыру',
    'Comparing models on 14 validation days',
  ],
  selectedStage: [
    'Выбрана модель: {model}. Независимая проверка.',
    'Таңдалған модель: {model}. Тәуелсіз тексеру.',
    'Selected model: {model}. Independent evaluation.',
  ],
  forecastStage: [
    'Подготовка итогового прогноза на доступной истории',
    'Қолжетімді тарих бойынша қорытынды болжам дайындау',
    'Preparing the final forecast from available history',
  ],
  formedStage: [
    'Временная проверка завершена, прогноз сформирован',
    'Уақыттық тексеру аяқталды, болжам жасалды',
    'Temporal evaluation complete; forecast generated',
  ],
  savedStage: [
    'Прогноз проверен и сохранён',
    'Болжам тексеріліп, сақталды',
    'Forecast validated and saved',
  ],
  stoppedStage: ['Расчёт остановлен', 'Есептеу тоқтатылды', 'Run stopped'],
  cancelledStage: [
    'Расчёт отменён пользователем',
    'Пайдаланушы есептеуді тоқтатты',
    'Run cancelled by the user',
  ],
  started: ['Агент начал расчёт', 'Агент есептеуді бастады', 'The agent started a run'],
  runReady: [
    'Прогноз готов. Результаты обновлены.',
    'Болжам дайын. Нәтижелер жаңартылды.',
    'Forecast ready. Results updated.',
  ],
  runFailed: [
    'Не удалось завершить расчёт',
    'Есептеу аяқталмады',
    'The run could not be completed',
  ],
  compareA: ['Первая версия', 'Бірінші нұсқа', 'First version'],
  compareB: ['Вторая версия', 'Екінші нұсқа', 'Second version'],
  chooseRun: ['Выберите расчёт', 'Есептеуді таңдаңыз', 'Choose a run'],
  compareNeed: [
    'Для сравнения нужны две завершённые версии.',
    'Салыстыру үшін екі аяқталған нұсқа қажет.',
    'Two completed versions are needed to compare.',
  ],
  noOverlap: [
    'У этих прогнозов нет общих целевых часов.',
    'Бұл болжамдарда ортақ мақсатты сағаттар жоқ.',
    'These forecasts have no shared target hours.',
  ],
  sameRun: [
    'Выберите две разные версии.',
    'Екі түрлі нұсқаны таңдаңыз.',
    'Choose two different versions.',
  ],
  overlap: ['Общие часы', 'Ортақ сағаттар', 'Shared hours'],
  difference: ['Разница B − A', 'Айырма B − A', 'Difference B − A'],
  meanDifference: [
    'Среднее абсолютное изменение',
    'Орташа абсолютті өзгеріс',
    'Mean absolute change',
  ],
  compareNote: [
    'Сравниваются только совпадающие часы. Изменение между версиями не является ошибкой относительно факта.',
    'Тек сәйкес сағаттар салыстырылады. Нұсқалар айырмасы нақты мәнге қатысты қате емес.',
    'Only matching target hours are compared. A change between versions is not an error against actual measurements.',
  ],
  appearance: ['Язык и внешний вид', 'Тіл және сыртқы көрініс', 'Language & appearance'],
  language: ['Язык интерфейса', 'Интерфейс тілі', 'Interface language'],
  theme: ['Тема', 'Тақырып', 'Theme'],
  light: ['Светлая', 'Ашық', 'Light'],
  dark: ['Тёмная', 'Қараңғы', 'Dark'],
  system: ['Как в системе', 'Жүйедегідей', 'System'],
  preferences: ['Рабочие настройки', 'Жұмыс баптаулары', 'Workspace preferences'],
  defaultHorizon: ['Горизонт по умолчанию', 'Әдепкі болжам кезеңі', 'Default forecast horizon'],
  savedLocally: [
    'Настройки сохраняются автоматически в этом браузере.',
    'Баптаулар осы браузерде автоматты сақталады.',
    'Settings are saved automatically in this browser.',
  ],
  toastSetting: [
    'Показывать всплывающие уведомления',
    'Қалқымалы хабарландыруларды көрсету',
    'Show notification toasts',
  ],
  remember: [
    'Запоминать страницу, турбину и период',
    'Бетті, турбинаны және кезеңді есте сақтау',
    'Remember page, turbine and period',
  ],
  accessibility: ['Доступность', 'Қолжетімділік', 'Accessibility'],
  reduceMotion: ['Уменьшить анимацию', 'Анимацияны азайту', 'Reduce motion'],
  textSize: ['Увеличенный текст', 'Үлкейтілген мәтін', 'Larger text'],
  resetSettings: ['Сбросить настройки', 'Баптауларды қалпына келтіру', 'Reset settings'],
  settingsReset: ['Настройки сброшены', 'Баптаулар қалпына келтірілді', 'Settings reset'],
  backup: ['Резервное копирование', 'Сақтық көшірме', 'Backup & restore'],
  backupDesc: [
    'Архив включает измерения, историю импортов, результаты, исходные файлы и файлы расчётов. Настройки браузера экспортируются отдельно.',
    'Мұрағатта өлшемдер, импорт тарихы, нәтижелер, бастапқы файлдар және есептеу файлдары бар. Браузер баптаулары бөлек экспортталады.',
    'The archive includes measurements, import history, results, source files and run files. Browser preferences are exported separately.',
  ],
  downloadBackup: ['Скачать резервную копию', 'Сақтық көшірмені жүктеп алу', 'Download backup'],
  creatingBackup: ['Создаём архив…', 'Мұрағат жасалуда…', 'Creating archive…'],
  restore: ['Восстановить', 'Қалпына келтіру', 'Restore'],
  backupFile: [
    'Архив SAMAL · ZIP до 512 МБ',
    'SAMAL мұрағаты · ZIP, 512 МБ дейін',
    'SAMAL archive · ZIP up to 512 MB',
  ],
  inspectBackup: ['Проверить архив', 'Мұрағатты тексеру', 'Inspect archive'],
  restoreWarning: [
    'Восстановление заменит текущие данные и результаты. Перед заменой автоматически сохраняется копия текущего состояния.',
    'Қалпына келтіру ағымдағы деректер мен нәтижелерді ауыстырады. Ауыстыру алдында ағымдағы күйдің көшірмесі автоматты сақталады.',
    'Restoring replaces current data and results. A recovery copy of the current state is saved automatically first.',
  ],
  confirmRestore: [
    'Заменить данные проверенной копией',
    'Деректерді тексерілген көшірмемен ауыстыру',
    'Replace data with this verified backup',
  ],
  restoring: ['Восстанавливаем…', 'Қалпына келтірілуде…', 'Restoring…'],
  restored: ['Данные восстановлены', 'Деректер қалпына келтірілді', 'Data restored'],
  recovery: [
    'Скачать состояние до восстановления',
    'Қалпына келтіруге дейінгі күйді жүктеу',
    'Download pre-restore recovery copy',
  ],
  exportPrefs: ['Экспорт настроек', 'Баптауларды экспорттау', 'Export preferences'],
  importPrefs: ['Импорт настроек', 'Баптауларды импорттау', 'Import preferences'],
  prefsImported: ['Настройки импортированы', 'Баптаулар импортталды', 'Preferences imported'],
  invalidPrefs: [
    'Некорректный файл настроек SAMAL',
    'SAMAL баптаулар файлы жарамсыз',
    'Invalid SAMAL preferences file',
  ],
  markRead: ['Прочитать все', 'Барлығын оқылған деп белгілеу', 'Mark all read'],
  clearNotifications: ['Очистить журнал', 'Журналды тазарту', 'Clear notifications'],
  unread: ['Непрочитанные', 'Оқылмаған', 'Unread'],
  read: ['Прочитано', 'Оқылды', 'Read'],
  notificationHint: [
    'До 200 последних событий на этом устройстве. События расчётов доступны также в журнале агента.',
    'Осы құрылғыдағы соңғы 200 оқиғаға дейін. Есептеу оқиғалары агент журналында да қолжетімді.',
    'Up to 200 recent events on this device. Run events also remain in the agent activity log.',
  ],
  welcome: ['Добро пожаловать в SAMAL', 'SAMAL қолданбасына қош келдіңіз', 'Welcome to SAMAL'],
  welcomeDesc: [
    'Ваш рабочий цикл — три простых шага.',
    'Жұмыс барысы — үш қарапайым қадам.',
    'Your workflow in three simple steps.',
  ],
  welcome1: [
    'Задайте часовой пояс и координаты турбин, затем импортируйте CSV с историей.',
    'Уақыт белдеуі мен турбина координаттарын көрсетіп, тарихы бар CSV импорттаңыз.',
    'Set the timezone and turbine coordinates, then import historical CSV data.',
  ],
  welcome2: [
    'Запустите прогноз на 24 или 48 часов. Агент сравнит обученные модели и базовые прогнозы.',
    '24 немесе 48 сағаттық болжамды іске қосыңыз. Агент оқытылған модельдер мен базалық болжамдарды салыстырады.',
    'Start a 24 or 48 hour forecast. The agent compares trained models and baselines.',
  ],
  welcome3: [
    'Загрузите новые измерения, оцените ошибку и сравните версии.',
    'Жаңа өлшемдерді жүктеп, қатені бағалаңыз және нұсқаларды салыстырыңыз.',
    'Upload new measurements, evaluate error and compare versions.',
  ],
  start: ['Начать работу', 'Жұмысты бастау', 'Get started'],
  showGuide: [
    'Показать вводную подсказку',
    'Кіріспе нұсқаулықты көрсету',
    'Show getting started guide',
  ],
  understood: ['Понятно', 'Түсінікті', 'Got it'],
  aboutText: [
    'SAMAL прогнозирует нормализованную мощность по истории и погоде. Текущий режим получает свежий прогноз, исторический использует архив. Деморежим использует вымышленные данные.',
    'SAMAL тарих пен ауа райы арқылы нормаланған қуатты болжайды. Ағымдағы режим жаңа болжамды, тарихи режим мұрағатты пайдаланады. Демо деректері ойдан шығарылған.',
    'SAMAL forecasts normalized power using history and weather. Live mode receives a current forecast; historical mode uses archives. Demo data is invented.',
  ],
  validationText: [
    'При обучении выбор выполняется по четырём 14-дневным отрезкам. Последние 14 дней используются для отдельной оценки. Далее сохранённые модели применяются повторно, пока данные и конфигурация не изменились.',
    'Оқыту кезінде модель төрт 14 күндік кезең бойынша таңдалады. Соңғы 14 күн бөлек бағалауға қолданылады. Деректер мен баптаулар өзгермесе, сақталған модельдер қайта пайдаланылады.',
    'Training selects models across four 14-day folds, with a separate final 14-day audit. Saved models are reused while the data and configuration remain unchanged.',
  ],
  limitations: [
    'Ошибка будущего прогноза станет известна после загрузки фактических измерений. Часовой пояс задаётся в настройках; отметка времени принята за начало интервала.',
    'Болашақ болжамның қатесі нақты өлшемдер жүктелгеннен кейін белгілі болады. Уақыт белдеуі баптауларда беріледі; уақыт белгісі интервалдың басын білдіреді.',
    'Future forecast error can be measured after actual observations are imported. The timezone is configured in settings; timestamps mark interval starts.',
  ],
  errorTitle: [
    'Не удалось выполнить действие',
    'Әрекет орындалмады',
    'The action could not be completed',
  ],
  diagnostic: ['Подробности сервера', 'Сервер мәліметтері', 'Server details'],
  connectionError: [
    'Нет связи с сервером. Проверьте, запущен ли SAMAL, и повторите.',
    'Сервермен байланыс жоқ. SAMAL іске қосылғанын тексеріп, қайталаңыз.',
    'Cannot reach the server. Check that SAMAL is running and retry.',
  ],
  busyError: [
    'Дождитесь завершения текущего расчёта или импорта.',
    'Ағымдағы есептеу немесе импорт аяқталғанша күтіңіз.',
    'Wait for the current run or import to finish.',
  ],
  fileError: [
    'Выберите CSV размером до 50 МБ.',
    '50 МБ дейінгі CSV таңдаңыз.',
    'Choose a CSV file up to 50 MB.',
  ],
  invalidCSV: [
    'Формат или значения CSV не прошли проверку. См. подробности ниже.',
    'CSV пішімі немесе мәндері тексеруден өтпеді. Төмендегі мәліметтерді қараңыз.',
    'The CSV format or values failed validation. See the details below.',
  ],
  originError: [
    'Начало должно быть целым часом после последних измерений и не дальше 90 дней.',
    'Басталу уақыты соңғы өлшемнен кейінгі толық сағат болуы және 90 күннен аспауы тиіс.',
    'Start must be a whole hour after the latest measurements, within 90 days.',
  ],
  archiveError: [
    'Архив не прошёл проверку. Текущие данные сохранены.',
    'Мұрағат тексеруден өтпеді. Ағымдағы деректер сақталды.',
    'The archive failed validation. Current data has been preserved.',
  ],
  countFiles: ['Файлы: {n}', 'Файлдар: {n}', 'Files: {n}'],
  countRuns: ['Запуски: {n}', 'Іске қосулар: {n}', 'Runs: {n}'],
} as const
export type Key = keyof typeof messages
export type Language = 'ru' | 'kk' | 'en'
export type Prefs = {
  language: Language
  theme: 'light' | 'dark' | 'system'
  defaultHorizon: 24 | 48
  autoRun: boolean
  toasts: boolean
  remember: boolean
  pageSize: number
  reduceMotion: boolean
  largeText: boolean
}
export const defaults: Prefs = {
  language: 'ru',
  theme: 'light',
  defaultHorizon: 48,
  autoRun: true,
  toasts: true,
  remember: true,
  pageSize: 10,
  reduceMotion: false,
  largeText: false,
}
export function validatePrefs(v: unknown): v is Prefs {
  if (!v || typeof v !== 'object') return false
  const p = v as Prefs
  return (
    ['ru', 'kk', 'en'].includes(p.language) &&
    ['light', 'dark', 'system'].includes(p.theme) &&
    [24, 48].includes(p.defaultHorizon) &&
    [10, 25, 50].includes(p.pageSize) &&
    ['autoRun', 'toasts', 'remember', 'reduceMotion', 'largeText'].every(
      (k) => typeof p[k as keyof Prefs] === 'boolean',
    )
  )
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* The workspace remains usable if browser storage is unavailable. */
  }
}
export function useStored<T>(key: string, initial: T) {
  const [v, set] = useState<T>(() => readLocal(key, initial))
  useEffect(() => writeLocal(key, v), [key, v])
  return [v, set] as const
}
const Context = createContext<{ prefs: Prefs; setPrefs: (p: Prefs) => void }>({
  prefs: defaults,
  setPrefs: () => {},
})
export function Preferences({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = readLocal('samal.preferences', defaults)
    return validatePrefs(p) ? p : defaults
  })
  useEffect(() => {
    writeLocal('samal.preferences', prefs)
    document.documentElement.lang = prefs.language
    document.documentElement.dataset.motion = prefs.reduceMotion ? 'reduced' : 'normal'
    document.documentElement.dataset.text = prefs.largeText ? 'large' : 'normal'
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === 'system' ? (media.matches ? 'dark' : 'light') : prefs.theme
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [prefs])
  return <Context.Provider value={{ prefs, setPrefs }}>{children}</Context.Provider>
}
export function useI18n() {
  const { prefs, setPrefs } = useContext(Context),
    locale = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' }[prefs.language],
    index = { ru: 0, kk: 1, en: 2 }[prefs.language]
  const t = (key: Key, values: Record<string, string | number> = {}) =>
    messages[key][index].replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`))
  const num = (n: number, d?: number) =>
    new Intl.NumberFormat(
      locale,
      d === undefined ? {} : { minimumFractionDigits: d, maximumFractionDigits: d },
    ).format(n)
  const pct = (n: number | null | undefined, d = 1) =>
    n == null
      ? '—'
      : new Intl.NumberFormat(locale, {
          style: 'percent',
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }).format(n)
  // CSV timestamps are timezone-free. UTC is only a formatting container and never shifts them.
  const date = (s: string, withTime = false, short = false) => {
    if (!s) return '—'
    const d = new Date(s.replace(' ', 'T').replace(/Z$/, '') + 'Z')
    if (!Number.isFinite(+d)) return s
    if (prefs.language === 'kk') {
      const iso = d.toISOString()
      return `${iso.slice(8, 10)}.${iso.slice(5, 7)}${short ? '' : '.' + iso.slice(0, 4)}${withTime ? ' · ' + iso.slice(11, 16) : ''}`
    }
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: '2-digit',
      month: short ? '2-digit' : 'short',
      year: short ? undefined : 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(d)
  }
  const created = (s: string) => {
    const d = new Date(s)
    if (!Number.isFinite(+d)) return '—'
    if (prefs.language === 'kk') {
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  }
  const model = (s: string) =>
    s === 'catboost_weather'
      ? t('weatherHybridModel')
      : s === 'catboost_weather_only'
        ? t('weatherOnlyModel')
        : s === 'catboost'
          ? 'CatBoost · RMSE'
          : s === 'catboost_mae'
            ? 'CatBoost · MAE'
            : s === 'persistence'
              ? t('persistence')
              : s === 'seasonal'
                ? t('seasonal')
                : s
  const event = (s: string) => {
    if (s.startsWith('WEATHER_')) {
      const [kind, a, b] = s.split(' '),
        [n, total] = (a || '').split('/')
      const simple: Record<string, Key> = {
        WEATHER_MODEL_REUSED: 'modelReused',
        WEATHER_MODEL_TRAINING: 'modelTraining',
        WEATHER_CACHE_INVALID: 'modelCacheInvalid',
        WEATHER_PLAN: 'weatherPlan',
        WEATHER_LIVE_FETCH: 'liveFetchStage',
        WEATHER_FEATURES: 'weatherFeatures',
        WEATHER_FINAL_TRAIN: 'weatherFinal',
        WEATHER_ANALYSIS: 'weatherAnalysis',
      }
      if (simple[kind]) return t(simple[kind])
      if (kind === 'WEATHER_ROUTE')
        return t('routeStage', {
          n: a,
          model: model(b),
          reason: t(s.endsWith('stale') ? 'decisionStale' : 'decisionFresh'),
        })
      if (kind === 'WEATHER_FETCH') return t('weatherFetch', { n, total })
      if (kind === 'WEATHER_VALIDATION') return t('weatherValidation', { n })
      if (kind === 'WEATHER_SELECTED')
        return t('weatherSelection', { model: model(a), fallback: model(b) })
      if (kind === 'WEATHER_FORECAST') return t('weatherForecastStage', { n, total })
      if (kind === 'WEATHER_RETRY') return t('weatherRetry', { n: a })
    }
    const map: Record<string, Key> = {
      'Подготовка снимка данных': 'snapshot',
      'Создана версия входных данных': 'snapshotSaved',
      'Проверка полноты часов и подготовка признаков': 'featureStage',
      'Обучение CatBoost на данных до периода проверки': 'trainingStage',
      'Сравнение моделей на 14 днях валидации': 'validationStage',
      'Подготовка итогового прогноза на доступной истории': 'forecastStage',
      'Временная проверка завершена, прогноз сформирован': 'formedStage',
      'Прогноз проверен и сохранён': 'savedStage',
      'Расчёт остановлен': 'stoppedStage',
      'Расчёт отменён пользователем': 'cancelledStage',
      'Расчёт прерван': 'stoppedStage',
    }
    if (map[s]) return t(map[s])
    const fold = s.match(/^Временная валидация (\d)\/4:/)
    if (fold) return t('rollingStage', { n: fold[1] })
    if (s.startsWith('Выбрана модель:'))
      return t('selectedStage', {
        model: s.includes('CatBoost')
          ? s.includes('MAE')
            ? 'CatBoost · MAE'
            : 'CatBoost · RMSE'
          : s.toLowerCase().includes('сезон')
            ? t('seasonal')
            : t('persistence'),
      })
    return s
  }
  const error = (s: string) => {
    if (prefs.language === 'ru' && !/fetch|network|abort/i.test(s)) return s
    return t(
      /fetch|network/i.test(s)
        ? 'connectionError'
        : /Дождитесь|Уже выполняется/.test(s)
          ? 'busyError'
          : /Строка|Колонка|CSV|Значения за|Файл превышает|измерений/.test(s)
            ? 'invalidCSV'
            : /Начало|начала|целого часа/.test(s)
              ? 'originError'
              : /архив|Архив|резервной/.test(s)
                ? 'archiveError'
                : 'errorTitle',
    )
  }
  return { prefs, setPrefs, t, num, pct, date, created, model, event, error }
}
