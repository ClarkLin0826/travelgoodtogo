const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;

createApp({
  setup() {
    // 🔐 登入狀態與行程選擇管理
    const isLoggedIn = ref(false);
    const loginUser = ref('');
    const loginPass = ref('');
    const loginLoading = ref(false);
    const loginError = ref('');
    
    // 行程選擇器相關狀態
    const showTripSelector = ref(false);
    const availableTrips = ref([]);
    
    const spreadsheetId = ref('');
    const tripName = ref('');

    // 全局狀態管理
    const loading = ref(false);
    const error = ref(null);
    const data = ref({ basicInfo: [], flights: [], hotels: [], tickets: [], itinerary: [], expenses: [], notes: [], aiRecords: [] });
    const activeTab = ref('home');
    const activeItineraryDay = ref('');
    const copiedIndex = ref(null);
    const calcInput = ref('');
    const navContainer = ref(null);
    const showNavHint = ref(false);
    const showLeftNavHint = ref(false);
    const isFullscreen = ref(false);
    
    const isAnalyzingReceipt = ref(false);
    const isSaving = ref(false);
    const showExpenseModal = ref(false);
    const newExpense = ref({ date: '', item: '', amount: '', currency: '', payer: '', split: '' });

    const aiCameraInput = ref(null);
    const aiMode = ref('');
    const isAiThinking = ref(false);

    const weatherInfo = ref({ temp: null, desc: '點擊查詢', icon: 'cloud-sun' });

    const tabs = [
      { id: 'home', label: '首頁', icon: 'navigation' },
      { id: 'flights', label: '機票住宿', icon: 'plane' },
      { id: 'tickets', label: '票券網卡', icon: 'ticket' },
      { id: 'itinerary', label: '每日行程', icon: 'clock' },
      { id: 'expenses', label: '共同記帳', icon: 'receipt' },
      { id: 'notes', label: '注意事項', icon: 'info' },
      { id: 'phrases', label: '旅遊對話', icon: 'message-circle' },
      { id: 'ai_guide', label: 'AI 導遊', icon: 'sparkles' }
    ];

    const renderIcons = () => { nextTick(() => { if (window.lucide) window.lucide.createIcons(); }); };

    // 🚀 共用 Fetch API 呼叫函數
    const callAPI = async (payload) => {
      const response = await fetch(GAS_API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return await response.json();
    };

    // 🔐 登入邏輯 (支援多行程判斷)
    const handleLogin = async () => {
      if (!loginUser.value || !loginPass.value) {
        loginError.value = "請輸入帳號與密碼";
        return;
      }
      loginLoading.value = true;
      loginError.value = "";
      try {
        const res = await callAPI({ action: 'login', user: loginUser.value, pass: loginPass.value });
        if (res.success) {
          if (res.trips && res.trips.length === 1) {
            // 只有一個行程，直接進入
            selectTrip(res.trips[0]);
          } else if (res.trips && res.trips.length > 1) {
            // 有多個行程，打開選擇器介面
            availableTrips.value = res.trips;
            showTripSelector.value = true;
          } else {
             // 舊版 API 相容性 (如果後端沒回傳 trips 陣列)
             selectTrip({ spreadsheetId: res.spreadsheetId, tripName: res.tripName });
          }
        } else {
          loginError.value = res.error || "登入失敗，請檢查帳號密碼";
        }
      } catch (err) {
        loginError.value = "伺服器連線失敗，請確認 API 網址是否正確";
      }
      loginLoading.value = false;
    };

    // 🎯 選擇行程邏輯
    const selectTrip = (trip) => {
      spreadsheetId.value = trip.spreadsheetId;
      tripName.value = trip.tripName;
      localStorage.setItem('travel_sid', trip.spreadsheetId);
      localStorage.setItem('travel_name', trip.tripName);
      showTripSelector.value = false;
      isLoggedIn.value = true;
      fetchItineraryData();
    };

    // 🚪 登出邏輯
    const handleLogout = () => {
      localStorage.removeItem('travel_sid');
      localStorage.removeItem('travel_name');
      isLoggedIn.value = false;
      showTripSelector.value = false;
      availableTrips.value = [];
      spreadsheetId.value = '';
      tripName.value = '';
      loginUser.value = '';
      loginPass.value = '';
      data.value = { basicInfo: [], flights: [], hotels: [], tickets: [], itinerary: [], expenses: [], notes: [], aiRecords: [] };
      activeTab.value = 'home';
    };

    // 📂 抓取行程表資料
    const fetchItineraryData = async () => {
      loading.value = true;
      try {
        const res = await callAPI({ action: 'getItinerary', spreadsheetId: spreadsheetId.value });
        if (res.success) {
          data.value = res.data;
          if (itineraryDays.value.length > 0) activeItineraryDay.value = itineraryDays.value[0];
          loading.value = false;
          renderIcons();
          setTimeout(checkNavScroll, 500);
          fetchWeather();
        } else {
          error.value = res.error || '資料解析失敗，請確認試算表設定';
          loading.value = false;
        }
      } catch (err) {
        error.value = '無法連線至伺服器: ' + err.message;
        loading.value = false;
      }
    };

    const triggerAiCamera = (mode) => {
      aiMode.value = mode;
      aiCameraInput.value.click();
    };

    // 🤖 AI 導遊照片上傳與 API 呼叫
    const handleAiUpload = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      isAiThinking.value = true;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = e.target.result.split(',')[1];
        try {
          const res = await callAPI({
            action: 'analyzeTravelImage',
            spreadsheetId: spreadsheetId.value,
            base64Image: base64String,
            mode: aiMode.value
          });

          if (res.success) {
            const aiText = res.result;
            
            // 儲存至試算表
            await callAPI({
              action: 'saveAiRecord',
              spreadsheetId: spreadsheetId.value,
              mode: aiMode.value,
              text: aiText
            });

            isAiThinking.value = false;
            const now = new Date();
            const timeStr = now.getFullYear() + '/' + String(now.getMonth()+1).padStart(2,'0') + '/' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
            
            if (!data.value.aiRecords) data.value.aiRecords = [];
            data.value.aiRecords.push({
              '時間': timeStr,
              '模式': aiMode.value,
              '內容': aiText
            });
            renderIcons();
          } else {
            isAiThinking.value = false;
            alert("AI 辨識失敗：" + res.error);
          }
        } catch (err) {
          isAiThinking.value = false;
          alert("伺服器連線失敗：" + err.message);
        }
        event.target.value = '';
      };
      reader.readAsDataURL(file);
    };

    const playZhSpeech = (text) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const sentences = text.match(/[^，。！？\n]+[，。！？\n]*/g) || [text];
        sentences.forEach(sentence => {
          if (sentence.trim() === '') return;
          const msg = new SpeechSynthesisUtterance(sentence);
          msg.lang = 'zh-TW';
          msg.rate = 1.0;
          window.speechSynthesis.speak(msg);
        });
      } else {
        alert('您的瀏覽器不支援語音功能');
      }
    };

    const checkNavScroll = () => {
      if (!navContainer.value) return;
      const el = navContainer.value;
      showNavHint.value = el.scrollWidth > el.clientWidth && Math.ceil(el.scrollWidth - el.clientWidth - el.scrollLeft) > 5;
      showLeftNavHint.value = el.scrollWidth > el.clientWidth && el.scrollLeft > 5;
    };

    const scrollNav = (direction) => {
      if (!navContainer.value) return;
      const amount = 120;
      navContainer.value.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    };

    const printPage = () => { window.print(); };

    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.log('無法進入全螢幕模式:', err);
          alert('你的瀏覽器可能不支援全螢幕模式，請試著旋轉手機或更換瀏覽器。');
        });
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    };

    const handleReceiptUpload = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      isAnalyzingReceipt.value = true;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = e.target.result.split(',')[1];
        try {
          const res = await callAPI({
            action: 'analyzeReceipt',
            spreadsheetId: spreadsheetId.value,
            base64Image: base64String
          });
          
          isAnalyzingReceipt.value = false;
          if (res.success) {
            try {
              const result = JSON.parse(res.result);
              if (result.error) {
                alert("AI 辨識失敗：" + result.error);
              } else {
                newExpense.value = {
                  date: result.date || new Date().toISOString().split('T')[0].replace(/-/g, '/'),
                  item: result.item || '',
                  amount: result.amount || '',
                  currency: result.currency || currency.value,
                  payer: '',
                  split: ''
                };
                showExpenseModal.value = true;
                renderIcons();
              }
            } catch (err) {
              alert("資料解析錯誤，請重試");
            }
          } else {
            alert("伺服器錯誤：" + res.error);
          }
        } catch (err) {
          isAnalyzingReceipt.value = false;
          alert("伺服器連線失敗：" + err.message);
        }
        event.target.value = '';
      };
      reader.readAsDataURL(file);
    };

    const submitExpense = async () => {
      if (!newExpense.value.item || !newExpense.value.amount || !newExpense.value.payer) {
        alert("請至少填寫：消費項目、金額、代墊付款人");
        return;
      }
      isSaving.value = true;
      try {
        const res = await callAPI({
          action: 'addExpense',
          spreadsheetId: spreadsheetId.value,
          expenseData: newExpense.value
        });
        isSaving.value = false;
        
        if (res.success) {
          showExpenseModal.value = false;
          data.value.expenses.unshift({
            '日期': newExpense.value.date,
            '消費項目': newExpense.value.item,
            '金額': newExpense.value.amount,
            '幣別': newExpense.value.currency,
            '代墊付款人': newExpense.value.payer,
            '分攤對象(用逗號分隔)': newExpense.value.split
          });
          alert("記帳成功！");
          renderIcons();
        } else {
          alert("寫入失敗：" + res.error);
        }
      } catch(err) {
        isSaving.value = false;
        alert("寫入失敗：" + err.message);
      }
    };

    const fetchWeather = async () => {
      const loc = basicInfo.value['旅遊地點'];
      if (!loc) return;
      try {
        let searchLoc = loc.replace(/韓國|南韓|日本|台灣|Taiwan|Korea|Japan/g, '').trim();
        if (!searchLoc) searchLoc = loc;
        const geoUrl = 'https://' + 'geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(searchLoc) + '&count=1&language=zh';
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          const latitude = geoData.results[0].latitude;
          const longitude = geoData.results[0].longitude;
          const weatherUrl = 'https://' + 'api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude + '&current_weather=true';
          const weatherRes = await fetch(weatherUrl);
          const weatherDataObj = await weatherRes.json();
          const current = weatherDataObj.current_weather;
          weatherInfo.value.temp = Math.round(current.temperature);
          const code = current.weathercode;
          if (code === 0) { weatherInfo.value.icon = 'sun'; weatherInfo.value.desc = '晴天'; }
          else if (code >= 1 && code <= 3) { weatherInfo.value.icon = 'cloud'; weatherInfo.value.desc = '多雲'; }
          else if (code >= 45 && code <= 48) { weatherInfo.value.icon = 'cloud-fog'; weatherInfo.value.desc = '有霧'; }
          else if (code >= 51 && code <= 67 || code >= 80 && code <= 82) { weatherInfo.value.icon = 'cloud-rain'; weatherInfo.value.desc = '下雨'; }
          else if (code >= 71 && code <= 77 || code >= 85 && code <= 86) { weatherInfo.value.icon = 'cloud-snow'; weatherInfo.value.desc = '下雪'; }
          else if (code >= 95) { weatherInfo.value.icon = 'cloud-lightning'; weatherInfo.value.desc = '雷雨'; }
          renderIcons();
        }
      } catch (e) {
        console.error('取得天氣失敗', e);
        weatherInfo.value.desc = '點擊查詢';
      }
    };

    const playSpeech = (text) => {
      let targetLangFull = 'en-US';
      let targetLangShort = 'en';
      if (isKorea.value) { targetLangFull = 'ko-KR'; targetLangShort = 'ko'; }
      else if (isJapan.value) { targetLangFull = 'ja-JP'; targetLangShort = 'ja'; }
      else if (isThailand.value) { targetLangFull = 'th-TH'; targetLangShort = 'th'; }
      else if (isVietnam.value) { targetLangFull = 'vi-VN'; targetLangShort = 'vi'; }

      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        const hasVoice = voices.length === 0 || voices.some(v => v.lang.includes(targetLangShort));
        if (hasVoice) {
          window.speechSynthesis.cancel();
          const msg = new SpeechSynthesisUtterance(text);
          msg.lang = targetLangFull;
          msg.rate = 0.85;
          window.speechSynthesis.speak(msg);
          return;
        }
      }
      const fallbackUrl = 'https://' + 'translate.google.com/?hl=zh-TW&sl=auto&tl=' + targetLangShort + '&text=' + encodeURIComponent(text) + '&op=translate';
      window.open(fallbackUrl, '_blank');
    };

    watch(activeTab, (newVal, oldVal) => {
      if (newVal !== oldVal) window.scrollTo({ top: 0, behavior: 'smooth' });
      renderIcons();
    });
    
    watch(activeItineraryDay, renderIcons);

    onMounted(() => {
      document.addEventListener('fullscreenchange', () => { isFullscreen.value = !!document.fullscreenElement; renderIcons(); });
      if ('speechSynthesis' in window) window.speechSynthesis.getVoices();

      // 啟動時檢查 LocalStorage 是否已經有登入紀錄
      const savedSid = localStorage.getItem('travel_sid');
      const savedName = localStorage.getItem('travel_name');
      if (savedSid) {
        spreadsheetId.value = savedSid;
        tripName.value = savedName || '';
        isLoggedIn.value = true;
        fetchItineraryData();
      } else {
        renderIcons();
      }
      
      window.addEventListener('resize', checkNavScroll);
    });

    const basicInfo = computed(() => data.value.basicInfo && data.value.basicInfo[0] ? data.value.basicInfo[0] : {});
    const currency = computed(() => basicInfo.value['當地貨幣'] || '外幣');
    const exchangeRate = computed(() => Number(basicInfo.value['基準匯率(對台幣)']) || 1);
    
    const isKorea = computed(() => /韓國|南韓|首爾|釜山|濟州|大邱|Korea/i.test(basicInfo.value['旅遊地點'] || ''));
    const isJapan = computed(() => /日本|東京|大阪|京都|北海道|沖繩|Japan/i.test(basicInfo.value['旅遊地點'] || ''));
    const isThailand = computed(() => /泰國|曼谷|清邁|普吉島|芭達雅|Thailand|Bangkok/i.test(basicInfo.value['旅遊地點'] || ''));
    const isVietnam = computed(() => /越南|胡志明|河內|峴港|富國島|Vietnam|Hanoi|Ho Chi Minh|Da Nang/i.test(basicInfo.value['旅遊地點'] || ''));
    const isEnglish = computed(() => /美國|英國|澳洲|加拿大|紐西蘭|夏威夷|關島|歐洲|USA|UK|Australia|Canada|New Zealand|Hawaii|Guam/i.test(basicInfo.value['旅遊地點'] || ''));

    const coverImage = computed(() => basicInfo.value['封面圖片網址'] || ('https://picsum.photos/seed/' + encodeURIComponent(basicInfo.value['旅遊地點'] || 'travel') + '/1600/900'));

    const countdownDays = computed(() => {
      const dateStr = basicInfo.value['出發日期'];
      if (!dateStr) return null;
      const targetDate = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      targetDate.setHours(0, 0, 0, 0);
      const diffTime = targetDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) return '距離出發還有 ' + diffDays + ' 天！';
      if (diffDays === 0) return '就是今天！旅途愉快！';
      return '已結束';
    });

    const calcResult = computed(() => isNaN(parseFloat(calcInput.value)) ? 0 : Math.round(parseFloat(calcInput.value) * exchangeRate.value));

    const uniqueAddresses = computed(() => {
      if(!data.value.hotels) return [];
      const addresses = [
        ...data.value.hotels.map(h => ({ name: h['飯店名稱'], address: h['地址'], type: 'hotel' })),
        ...data.value.itinerary.map(i => ({ name: i['景點/活動名稱'], address: i['地址'], type: 'attraction' }))
      ].filter(item => item.address && item.address.trim() !== '');
      const map = new Map();
      addresses.forEach(item => map.set(item.address, item));
      return Array.from(map.values());
    });

    const groupedItinerary = computed(() => {
      if(!data.value.itinerary) return {};
      const groups = {};
      data.value.itinerary.forEach(item => {
        const day = item['天數'];
        if (!groups[day]) groups[day] = [];
        groups[day].push(item);
      });
      Object.keys(groups).forEach(day => {
        groups[day].sort((a, b) => String(a['時間'] || '').padStart(5, '0').localeCompare(String(b['時間'] || '').padStart(5, '0')));
      });
      return groups;
    });

    const itineraryDays = computed(() => Object.keys(groupedItinerary.value).sort());

    const getMapSearchUrl = (text) => {
      if (!text) return '#';
      if (isKorea.value) return 'https://map.naver.com/p/search/' + encodeURIComponent(text);
      return 'https://' + 'www.google.com' + '/maps/dir/?api=1&destination=' + encodeURIComponent(text);
    };

    const currentDayDirectionsUrl = computed(() => {
      if (isKorea.value) return null;
      const dayItems = groupedItinerary.value[activeItineraryDay.value] || [];
      const locations = dayItems.map(item => item['地址']).filter(addr => addr && addr.trim() !== '');
      if (locations.length === 0) return null;

      const domain = 'https://' + 'www.google.com' + '/maps';
      if (locations.length === 1) return domain + '/dir/?api=1&destination=' + encodeURIComponent(locations[0]);

      const origin = encodeURIComponent(locations[0]);
      const destination = encodeURIComponent(locations[locations.length - 1]);
      const waypoints = locations.slice(1, -1).map(loc => encodeURIComponent(loc)).join('|');
      let url = domain + '/dir/?api=1&origin=' + origin + '&destination=' + destination;
      if (waypoints) url += '&waypoints=' + waypoints;
      return url;
    });

    const settlement = computed(() => {
      if(!data.value.expenses) return { transactions: [] };
      const balances = {};
      data.value.expenses.forEach(exp => {
        const rawAmount = Number(exp['金額']);
        const expCurrency = (exp['幣別'] || '').trim().toUpperCase();
        let amountInTWD = rawAmount;
        if (expCurrency !== 'TWD') amountInTWD = rawAmount * exchangeRate.value;

        const payer = (exp['代墊付款人'] || '').trim();
        const splitTargets = (exp['分攤對象(用逗號分隔)'] || '').split(',').map(s => s.trim()).filter(s => s);
        if (splitTargets.length === 0 || !payer) return;
        const splitAmount = amountInTWD / splitTargets.length;

        balances[payer] = (balances[payer] || 0) + amountInTWD;
        splitTargets.forEach(target => { balances[target] = (balances[target] || 0) - splitAmount; });
      });

      const debtors = [];
      const creditors = [];
      Object.entries(balances).forEach(([name, balance]) => {
        if (balance < -0.01) debtors.push({ name, amount: Math.abs(balance) });
        else if (balance > 0.01) creditors.push({ name, amount: balance });
      });

      const transactions = [];
      debtors.sort((a, b) => b.amount - a.amount);
      creditors.sort((a, b) => b.amount - a.amount);

      let d = 0, c = 0;
      while (d < debtors.length && c < creditors.length) {
        const debtor = debtors[d];
        const creditor = creditors[c];
        const amount = Math.min(debtor.amount, creditor.amount);
        if (amount > 0.01) transactions.push({ from: debtor.name, to: creditor.name, amount: Math.round(amount) });
        debtor.amount -= amount;
        creditor.amount -= amount;
        if (debtor.amount < 0.01) d++;
        if (creditor.amount < 0.01) c++;
      }
      return { transactions };
    });

    const copyToClipboard = (text, index) => {
      const updateState = () => {
        copiedIndex.value = index;
        renderIcons();
        setTimeout(() => { copiedIndex.value = null; renderIcons(); }, 2000);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(updateState).catch(() => { fallbackCopyTextToClipboard(text); updateState(); });
      } else {
        fallbackCopyTextToClipboard(text);
        updateState();
      }
    };

    const fallbackCopyTextToClipboard = (text) => {
      var textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus(); textArea.select();
      try { document.execCommand('copy'); } catch (err) { console.error('複製失敗', err); }
      document.body.removeChild(textArea);
    };

    const travelPhrases = computed(() => {
      if (isKorea.value) {
        return [
          { category: '基本問候', zh: '你好', foreign: '안녕하세요', pronunciation: '安妞哈塞喲' },
          { category: '基本問候', zh: '謝謝', foreign: '감사합니다', pronunciation: '砍撒哈咪搭' },
          { category: '基本問候', zh: '對不起', foreign: '죄송합니다', pronunciation: '罪松哈咪搭' },
          { category: '餐廳點餐', zh: '呼叫服務生說不好意思', foreign: '저기요', pronunciation: '邱gi喲' },
          { category: '餐廳點餐', zh: '請給我這個', foreign: '이거 주세요', pronunciation: '以勾 珠塞喲' },
          { category: '餐廳點餐', zh: '請結帳', foreign: '계산해 주세요', pronunciation: '給散嘿 珠塞喲' },
          { category: '購物殺價', zh: '這個多少錢？', foreign: '이거 얼마예요?', pronunciation: '以勾 歐媽耶喲' },
          { category: '購物殺價', zh: '太貴了', foreign: '너무 비싸요', pronunciation: 'NO姆 批撒喲' },
          { category: '購物殺價', zh: '請算便宜一點', foreign: '좀 깎아주세요', pronunciation: '炯 嘎嘎珠塞喲' },
          { category: '實用問路', zh: '洗手間在哪裡？', foreign: '화장실 어디예요?', pronunciation: '花江系 歐低耶喲' },
          { category: '緊急狀況', zh: '救命！', foreign: '살려주세요!', pronunciation: '撒溜珠塞喲' }
        ];
      } else if (isJapan.value) {
        return [
          { category: '基本問候', zh: '你好', foreign: 'こんにちは', pronunciation: '空尼基哇' },
          { category: '基本問候', zh: '謝謝', foreign: 'ありがとうございます', pronunciation: '阿哩嘎多 勾札以瑪斯' },
          { category: '基本問候', zh: '對不起 / 請問一下', foreign: 'すみません', pronunciation: '斯咪媽森' },
          { category: '餐廳點餐', zh: '請給我這個', foreign: 'これをお願いします', pronunciation: '口勒 歐捏該西瑪斯' },
          { category: '餐廳點餐', zh: '請結帳', foreign: 'お会計お願いします', pronunciation: '歐開K 歐捏該西瑪斯' },
          { category: '購物殺價', zh: '這個多少錢？', foreign: 'これいくらですか', pronunciation: '口勒 以庫拉 爹斯卡' },
          { category: '實用問路', zh: '洗手間在哪裡？', foreign: 'トイレはどこですか', pronunciation: '偷以勒哇 豆口爹斯卡' },
          { category: '緊急狀況', zh: '請幫幫我！', foreign: '助けてください!', pronunciation: '他斯K爹 哭搭賽' }
        ];
      } else if (isThailand.value) {
        return [
          { category: '基本問候', zh: '你好', foreign: 'สวัสดี', pronunciation: '撒哇滴卡' },
          { category: '基本問候', zh: '謝謝', foreign: 'ขอบคุณ', pronunciation: '擴昆卡' },
          { category: '基本問候', zh: '對不起', foreign: 'ขอโทษ', pronunciation: '叩透卡' },
          { category: '餐廳點餐', zh: '呼叫服務生', foreign: 'พี่คะ', pronunciation: '屁卡' },
          { category: '餐廳點餐', zh: '請給我這個', foreign: 'เอาอันนี้ค่ะ', pronunciation: '凹安逆卡' },
          { category: '餐廳點餐', zh: '請結帳', foreign: 'เก็บตังค์ด้วยค่ะ', pronunciation: '給當堆卡' },
          { category: '購物殺價', zh: '這個多少錢？', foreign: 'อันนี้เท่าไหร่คะ', pronunciation: '安逆套萊卡' },
          { category: '購物殺價', zh: '太貴了', foreign: 'แพงไป', pronunciation: '胖拜' },
          { category: '購物殺價', zh: '請算便宜一點', foreign: 'ลดหน่อยได้ไหมคะ', pronunciation: '摟諾代買卡' },
          { category: '實用問路', zh: '洗手間在哪裡？', foreign: 'ห้องน้ำอยู่ที่ไหนคะ', pronunciation: '烘南有替哪卡' },
          { category: '緊急狀況', zh: '救命！', foreign: 'ช่วยด้วย', pronunciation: '捶堆' }
        ];
      } else if (isVietnam.value) {
        return [
          { category: '基本問候', zh: '你好', foreign: 'Xin chào', pronunciation: '辛早' },
          { category: '基本問候', zh: '謝謝', foreign: 'Cảm ơn', pronunciation: '嘎恩 (感謝)' },
          { category: '基本問候', zh: '對不起', foreign: 'Xin lỗi', pronunciation: '辛摟以' },
          { category: '餐廳點餐', zh: '呼叫服務生', foreign: 'Em ơi', pronunciation: '欸姆歐以' },
          { category: '餐廳點餐', zh: '請給我這個', foreign: 'Cho tôi cái này', pronunciation: '糾堆蓋乃' },
          { category: '餐廳點餐', zh: '請結帳', foreign: 'Tính tiền', pronunciation: '丁點' },
          { category: '購物殺價', zh: '這個多少錢？', foreign: 'Cái này bao nhiêu tiền?', pronunciation: '蓋乃包妞點' },
          { category: '購物殺價', zh: '太貴了', foreign: 'Mắc quá', pronunciation: '罵瓜' },
          { category: '購物殺價', zh: '請算便宜一點', foreign: 'Bớt đi', pronunciation: '伯滴' },
          { category: '實用問路', zh: '洗手間在哪裡？', foreign: 'Nhà vệ sinh ở đâu?', pronunciation: '雅維辛阿兜' },
          { category: '緊急狀況', zh: '救命！', foreign: 'Cứu tôi với!', pronunciation: '救堆貝' }
        ];
      } else if (isEnglish.value) {
        return [
          { category: '基本問候', zh: '你好', foreign: 'Hello', pronunciation: '哈囉' },
          { category: '基本問候', zh: '謝謝', foreign: 'Thank you', pronunciation: '桑Q' },
          { category: '基本問候', zh: '對不起', foreign: 'Excuse me / Sorry', pronunciation: '依斯Q斯密 / 搜哩' },
          { category: '餐廳點餐', zh: '呼叫服務生', foreign: 'Excuse me', pronunciation: '依斯Q斯密' },
          { category: '餐廳點餐', zh: '請給我這個', foreign: "I'll have this, please.", pronunciation: '哀歐 海夫 歷史 普立茲' },
          { category: '餐廳點餐', zh: '請結帳', foreign: 'Check, please.', pronunciation: '卻克 普立茲' },
          { category: '購物殺價', zh: '這個多少錢？', foreign: 'How much is this?', pronunciation: '豪 馬取 伊茲 歷史' },
          { category: '購物殺價', zh: '太貴了', foreign: 'Too expensive.', pronunciation: '兔 依斯篇西夫' },
          { category: '購物殺價', zh: '請算便宜一點', foreign: 'Can you give me a discount?', pronunciation: '坎 U 給夫 密 額 滴斯抗' },
          { category: '實用問路', zh: '洗手間在哪裡？', foreign: 'Where is the restroom?', pronunciation: '威爾 伊茲 惹 瑞斯潤' },
          { category: '緊急狀況', zh: '救命！', foreign: 'Help!', pronunciation: '赫普' }
        ];
      }
      return [];
    });

    const globalTranslateUrl = computed(() => {
      let targetLang = 'en';
      if (isKorea.value) targetLang = 'ko';
      else if (isJapan.value) targetLang = 'ja';
      else if (isThailand.value) targetLang = 'th';
      else if (isVietnam.value) targetLang = 'vi';
      return 'https://' + 'translate.google.com/?hl=zh-TW&sl=zh-TW&tl=' + targetLang + '&op=translate';
    });

    // 🚀 回傳所有綁定到畫面的變數與函數 (加上了 showTripSelector, availableTrips, selectTrip)
    return {
      isLoggedIn, loginUser, loginPass, loginLoading, loginError, handleLogin, handleLogout, tripName,
      showTripSelector, availableTrips, selectTrip,
      loading, error, data, activeTab, tabs, basicInfo, coverImage,
      uniqueAddresses, copiedIndex, copyToClipboard, countdownDays,
      itineraryDays, activeItineraryDay, groupedItinerary, currentDayDirectionsUrl,
      getMapSearchUrl, isKorea, navContainer, showNavHint, showLeftNavHint, checkNavScroll, scrollNav, printPage,
      isFullscreen, toggleFullscreen, weatherInfo, travelPhrases, globalTranslateUrl, playSpeech,
      currency, exchangeRate, calcInput, calcResult, settlement,
      isAnalyzingReceipt, isSaving, showExpenseModal, newExpense, handleReceiptUpload, submitExpense,
      aiCameraInput, aiMode, isAiThinking, triggerAiCamera, handleAiUpload, playZhSpeech
    };
  }
}).mount('#app');