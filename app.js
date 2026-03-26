const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;

createApp({
  setup() {
    const isLoggedIn = ref(false);
    const isRegisterMode = ref(false); // 新增：控制登入/註冊畫面
    
    const loginUser = ref('');
    const loginPass = ref('');
    const loginLoading = ref(false);
    const loginError = ref('');
    const loginSuccessMsg = ref(''); // 新增：註冊成功的提示
    
    const userPermission = ref('free'); 
    const isPremium = computed(() => userPermission.value === 'premium');
    
    const showTripSelector = ref(false);
    const availableTrips = ref([]);
    
    // SaaS 新功能變數
    const newTripNameInput = ref('');
    const inviteCodeInput = ref('');
    const isActionLoading = ref(false);
    
    // 目前選中的旅程資訊
    const spreadsheetId = ref('');
    const tripName = ref('');
    const currentRole = ref('');
    const currentInviteCode = ref('');

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
    const isUploadingReceipt = ref(false); 
    const isSaving = ref(false);
    const showExpenseModal = ref(false);
    const newExpense = ref({ date: '', item: '', amount: '', currency: '', payer: '', split: [], receiptUrl: '' });

    const aiCameraInput = ref(null);
    const aiMode = ref('');
    const isAiThinking = ref(false);

    const weatherInfo = ref({ temp: null, desc: '點擊查詢', icon: 'cloud-sun' });

    const tabs = [
      { id: 'home', label: '首頁', icon: 'navigation' },
      { id: 'flights', label: '機票住宿', icon: 'plane' },
      { id: 'tickets', label: '票券', icon: 'ticket' },
      { id: 'itinerary', label: '行程', icon: 'clock' },
      { id: 'expenses', label: '記帳', icon: 'receipt' },
      { id: 'ai_guide', label: 'AI導遊', icon: 'sparkles' }
    ];

    const renderIcons = () => { nextTick(() => { setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50); }); };

    const callAPI = async (payload) => {
      const response = await fetch(GAS_API_URL, { method: "POST", body: JSON.stringify(payload) });
      return await response.json();
    };

    const toggleRegisterMode = () => {
      isRegisterMode.value = !isRegisterMode.value;
      loginError.value = '';
      loginSuccessMsg.value = '';
    };

    const handleRegister = async () => {
      if (!loginUser.value || !loginPass.value) { loginError.value = "請輸入帳號與密碼"; return; }
      loginLoading.value = true; loginError.value = ""; loginSuccessMsg.value = "";
      try {
        const res = await callAPI({ action: 'register', user: loginUser.value, pass: loginPass.value });
        if (res.success) {
          loginSuccessMsg.value = "註冊成功！請直接點擊登入。";
          isRegisterMode.value = false;
        } else {
          loginError.value = res.error || "註冊失敗";
        }
      } catch (err) { loginError.value = "伺服器連線失敗"; }
      loginLoading.value = false;
    };

    const handleLogin = async () => {
      if (!loginUser.value || !loginPass.value) { loginError.value = "請輸入帳號與密碼"; return; }
      loginLoading.value = true; loginError.value = ""; loginSuccessMsg.value = "";
      try {
        const res = await callAPI({ action: 'login', user: loginUser.value, pass: loginPass.value });
        if (res.success) {
          localStorage.setItem('travel_login_time', Date.now().toString());
          localStorage.setItem('travel_user', loginUser.value);
          userPermission.value = res.permission || 'free'; 

          availableTrips.value = res.trips || [];
          showTripSelector.value = true;
          isLoggedIn.value = false; // 停留在選擇畫面
        } else {
          loginError.value = res.error || "帳號或密碼錯誤";
        }
      } catch (err) { loginError.value = "伺服器連線失敗"; }
      loginLoading.value = false;
    };

    const handleCreateTrip = async () => {
      if (!newTripNameInput.value) { alert("請輸入旅程名稱！"); return; }
      isActionLoading.value = true;
      try {
        const res = await callAPI({ action: 'createTrip', user: loginUser.value, tripName: newTripNameInput.value });
        if (res.success) {
          alert(`建立成功！您的邀請碼是：${res.inviteCode}\n系統即將載入您的專屬行程表。`);
          selectTrip(res);
        } else { alert(res.error || "建立失敗"); }
      } catch (e) { alert("伺服器錯誤"); }
      isActionLoading.value = false;
    };

    const handleJoinTrip = async () => {
      if (!inviteCodeInput.value) { alert("請輸入邀請碼！"); return; }
      isActionLoading.value = true;
      try {
        const res = await callAPI({ action: 'joinTrip', user: loginUser.value, inviteCode: inviteCodeInput.value });
        if (res.success) {
          alert(`成功加入「${res.tripName}」！\n系統即將載入行程表。`);
          selectTrip(res);
        } else { alert(res.error || "加入失敗"); }
      } catch (e) { alert("伺服器錯誤"); }
      isActionLoading.value = false;
    };

    const selectTrip = (trip) => {
      spreadsheetId.value = trip.spreadsheetId;
      tripName.value = trip.tripName;
      currentRole.value = trip.role || '同行者';
      currentInviteCode.value = trip.inviteCode || '';
      
      localStorage.setItem('travel_sid', trip.spreadsheetId);
      localStorage.setItem('travel_name', trip.tripName);
      localStorage.setItem('travel_role', currentRole.value);
      localStorage.setItem('travel_invite', currentInviteCode.value);
      
      showTripSelector.value = false;
      isLoggedIn.value = true;
      fetchItineraryData();
    };

    const handleSwitchTrip = () => {
      isLoggedIn.value = false;
      showTripSelector.value = true;
      // 重新呼叫一次 login 以獲取最新清單
      handleLogin();
    };

    const handleLogout = () => {
      localStorage.clear();
      isLoggedIn.value = false;
      showTripSelector.value = false;
      loginUser.value = '';
      loginPass.value = '';
      availableTrips.value = [];
    };

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
          error.value = res.error || '資料解析失敗';
          loading.value = false;
        }
      } catch (err) {
        error.value = '無法連線至伺服器';
        loading.value = false;
      }
    };

    const triggerAiCamera = (mode) => { aiMode.value = mode; aiCameraInput.value.click(); };

    const handleAiUpload = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      isAiThinking.value = true;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = e.target.result.split(',')[1];
        try {
          const res = await callAPI({ action: 'analyzeTravelImage', spreadsheetId: spreadsheetId.value, base64Image: base64String, mode: aiMode.value });
          if (res.success) {
            const aiText = res.result;
            await callAPI({ action: 'saveAiRecord', spreadsheetId: spreadsheetId.value, mode: aiMode.value, text: aiText });
            isAiThinking.value = false;
            fetchItineraryData(); // 重新整理抓取最新 AI 紀錄
          } else { isAiThinking.value = false; alert("AI 辨識失敗：" + res.error); }
        } catch (err) { isAiThinking.value = false; alert("連線失敗"); }
        event.target.value = '';
      };
      reader.readAsDataURL(file);
    };

    const playZhSpeech = (text) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'zh-TW';
        window.speechSynthesis.speak(msg);
      }
    };

    const playSpeech = (text) => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(text);
        if (isKorea.value) msg.lang = 'ko-KR';
        else if (isJapan.value) msg.lang = 'ja-JP';
        window.speechSynthesis.speak(msg);
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
      navContainer.value.scrollBy({ left: direction === 'left' ? -120 : 120, behavior: 'smooth' });
    };

    const printPage = () => { window.print(); };

    const toggleFullscreen = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else if (document.exitFullscreen) document.exitFullscreen();
    };

    const basicInfo = computed(() => data.value.basicInfo && data.value.basicInfo[0] ? data.value.basicInfo[0] : {});
    const currency = computed(() => basicInfo.value['當地貨幣'] || '外幣');
    const exchangeRate = computed(() => Number(basicInfo.value['基準匯率(對台幣)']) || 1);

    const travelMates = computed(() => {
      const namesStr = basicInfo.value['同行名單(用逗號分隔)'];
      if (!namesStr) return [];
      return namesStr.split(/[,，]/).map(n => n.trim()).filter(n => n);
    });

    const handleReceiptUpload = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      isUploadingReceipt.value = true;
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64String = e.target.result.split(',')[1];
        try {
          const res = await callAPI({ action: 'uploadReceipt', spreadsheetId: spreadsheetId.value, tripName: tripName.value, base64Image: base64String });
          isUploadingReceipt.value = false;
          if (res.success) {
            const today = new Date();
            newExpense.value = { date: today.getFullYear() + '/' + String(today.getMonth()+1).padStart(2,'0') + '/' + String(today.getDate()).padStart(2,'0'), item: '', amount: '', currency: currency.value, payer: travelMates.value[0] || '', split: [...travelMates.value], receiptUrl: res.url };
            showExpenseModal.value = true; renderIcons();
          } else { alert("伺服器錯誤：" + res.error); }
        } catch (err) { isUploadingReceipt.value = false; alert("連線失敗"); }
        event.target.value = '';
      };
      reader.readAsDataURL(file);
    };

    const submitExpense = async () => {
      if (!newExpense.value.item || !newExpense.value.amount || !newExpense.value.payer || newExpense.value.split.length === 0) { alert("請確實填寫"); return; }
      isSaving.value = true;
      const payloadExpense = { ...newExpense.value, split: newExpense.value.split.join(', ') };
      try {
        const res = await callAPI({ action: 'addExpense', spreadsheetId: spreadsheetId.value, expenseData: payloadExpense });
        isSaving.value = false;
        if (res.success) {
          showExpenseModal.value = false;
          fetchItineraryData(); // 重新整理抓最新記帳
          alert("記帳成功！");
        } else { alert("寫入失敗"); }
      } catch(err) { isSaving.value = false; alert("連線失敗"); }
    };

    const fetchWeather = async () => {
      const loc = basicInfo.value['旅遊地點'];
      if (!loc) return;
      try {
        let searchLoc = loc.replace(/韓國|南韓|日本|台灣|Taiwan|Korea|Japan/g, '').trim();
        if (!searchLoc) searchLoc = loc;
        const geoUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(searchLoc) + '&count=1&language=zh';
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          const latitude = geoData.results[0].latitude;
          const longitude = geoData.results[0].longitude;
          const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude + '&current_weather=true';
          const weatherRes = await fetch(weatherUrl);
          const weatherDataObj = await weatherRes.json();
          const current = weatherDataObj.current_weather;
          weatherInfo.value.temp = Math.round(current.temperature);
          const code = current.weathercode;
          if (code === 0) { weatherInfo.value.icon = 'sun'; weatherInfo.value.desc = '晴天'; }
          else if (code >= 1 && code <= 3) { weatherInfo.value.icon = 'cloud'; weatherInfo.value.desc = '多雲'; }
          else if (code >= 51 || code >= 80) { weatherInfo.value.icon = 'cloud-rain'; weatherInfo.value.desc = '下雨'; }
          renderIcons();
        }
      } catch (e) { weatherInfo.value.desc = '點擊查詢'; }
    };

    watch(activeTab, (newVal, oldVal) => { if (newVal !== oldVal) window.scrollTo({ top: 0, behavior: 'smooth' }); renderIcons(); });
    watch(activeItineraryDay, renderIcons);
    watch([isLoggedIn, showTripSelector, isRegisterMode], renderIcons);

    onMounted(() => {
      document.addEventListener('fullscreenchange', () => { isFullscreen.value = !!document.fullscreenElement; renderIcons(); });
      
      const savedTime = localStorage.getItem('travel_login_time');
      const savedSid = localStorage.getItem('travel_sid');
      const savedUser = localStorage.getItem('travel_user');

      if (savedTime && (Date.now() - parseInt(savedTime)) > 604800000) { handleLogout(); return; }

      if (savedSid && savedUser) {
        loginUser.value = savedUser;
        spreadsheetId.value = savedSid;
        tripName.value = localStorage.getItem('travel_name') || '';
        currentRole.value = localStorage.getItem('travel_role') || '同行者';
        currentInviteCode.value = localStorage.getItem('travel_invite') || '';
        isLoggedIn.value = true;
        fetchItineraryData();
      } else { renderIcons(); }
      
      window.addEventListener('resize', checkNavScroll);
    });

    const isKorea = computed(() => /韓國|南韓|首爾|釜山|Korea/i.test(basicInfo.value['旅遊地點'] || ''));
    const isJapan = computed(() => /日本|東京|大阪|京都|Japan/i.test(basicInfo.value['旅遊地點'] || ''));
    const coverImage = computed(() => basicInfo.value['封面圖片網址'] || ('https://picsum.photos/seed/' + encodeURIComponent(basicInfo.value['旅遊地點'] || 'travel') + '/1600/900'));

    const countdownDays = computed(() => {
      const dateStr = basicInfo.value['出發日期'];
      if (!dateStr) return null;
      const diffDays = Math.ceil((new Date(dateStr) - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? `還有 ${diffDays} 天！` : diffDays === 0 ? '就是今天！' : '已結束';
    });

    const calcResult = computed(() => isNaN(parseFloat(calcInput.value)) ? 0 : Math.round(parseFloat(calcInput.value) * exchangeRate.value));

    const uniqueAddresses = computed(() => {
      if(!data.value.hotels) return [];
      const addresses = [...data.value.hotels.map(h => ({ name: h['飯店名稱'], address: h['地址'], type: 'hotel' })), ...data.value.itinerary.map(i => ({ name: i['景點/活動名稱'], address: i['地址'], type: 'attraction' }))].filter(item => item.address && item.address.trim() !== '');
      const map = new Map(); addresses.forEach(item => map.set(item.address, item)); return Array.from(map.values());
    });

    const groupedItinerary = computed(() => {
      if(!data.value.itinerary) return {};
      const groups = {};
      data.value.itinerary.forEach(item => { const day = item['天數']; if (!groups[day]) groups[day] = []; groups[day].push(item); });
      Object.keys(groups).forEach(day => groups[day].sort((a, b) => String(a['時間'] || '').padStart(5, '0').localeCompare(String(b['時間'] || '').padStart(5, '0'))));
      return groups;
    });

    const itineraryDays = computed(() => Object.keys(groupedItinerary.value).sort());
    const getMapSearchUrl = (text) => text ? (isKorea.value ? 'https://map.naver.com/p/search/' + encodeURIComponent(text) : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(text)) : '#';

    const settlement = computed(() => {
      if(!data.value.expenses) return { transactions: [] };
      const balances = {};
      data.value.expenses.forEach(exp => {
        let amountInTWD = Number(exp['金額']);
        if ((exp['幣別'] || '').toUpperCase() !== 'TWD') amountInTWD *= exchangeRate.value;
        const payer = (exp['代墊付款人'] || '').trim();
        const splitTargets = (exp['分攤對象(用逗號分隔)'] || '').split(',').map(s => s.trim()).filter(s => s);
        if (splitTargets.length === 0 || !payer) return;
        const splitAmount = amountInTWD / splitTargets.length;
        balances[payer] = (balances[payer] || 0) + amountInTWD;
        splitTargets.forEach(t => balances[t] = (balances[t] || 0) - splitAmount);
      });
      const debtors = Object.entries(balances).filter(([, b]) => b < -0.01).map(([n, b]) => ({ name: n, amount: Math.abs(b) })).sort((a, b) => b.amount - a.amount);
      const creditors = Object.entries(balances).filter(([, b]) => b > 0.01).map(([n, b]) => ({ name: n, amount: b })).sort((a, b) => b.amount - a.amount);
      const transactions = []; let d = 0, c = 0;
      while (d < debtors.length && c < creditors.length) {
        const amount = Math.min(debtors[d].amount, creditors[c].amount);
        if (amount > 0.01) transactions.push({ from: debtors[d].name, to: creditors[c].name, amount: Math.round(amount) });
        debtors[d].amount -= amount; creditors[c].amount -= amount;
        if (debtors[d].amount < 0.01) d++; if (creditors[c].amount < 0.01) c++;
      }
      return { transactions };
    });

    const copyToClipboard = (text, idx) => {
      navigator.clipboard.writeText(text).then(() => {
        if(idx === 'invite') alert("邀請碼已複製！");
        else { copiedIndex.value = idx; setTimeout(() => { copiedIndex.value = null; renderIcons(); }, 2000); }
        renderIcons();
      });
    };

    return {
      isLoggedIn, isRegisterMode, loginUser, loginPass, loginLoading, loginError, loginSuccessMsg,
      toggleRegisterMode, handleRegister, handleLogin, handleLogout, 
      showTripSelector, availableTrips, selectTrip, handleSwitchTrip, handleCreateTrip, handleJoinTrip,
      newTripNameInput, inviteCodeInput, isActionLoading, currentRole, currentInviteCode,
      userPermission, isPremium, travelMates, isUploadingReceipt, spreadsheetId, tripName,
      loading, error, data, activeTab, tabs, basicInfo, coverImage, uniqueAddresses, copiedIndex, copyToClipboard, countdownDays,
      itineraryDays, activeItineraryDay, groupedItinerary, getMapSearchUrl, isKorea, navContainer, showNavHint, showLeftNavHint, checkNavScroll, scrollNav, printPage,
      isFullscreen, toggleFullscreen, weatherInfo, playSpeech, playZhSpeech, currency, exchangeRate, calcInput, calcResult, settlement,
      isSaving, showExpenseModal, newExpense, handleReceiptUpload, submitExpense, aiCameraInput, aiMode, isAiThinking, triggerAiCamera, handleAiUpload, isAnalyzingReceipt
    };
  }
}).mount('#app');