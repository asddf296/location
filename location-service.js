// location-service.js
// 位置信息服务 - 完整修复版

// ========== 配置 ==========
const SUPABASE_CONFIG = {
    url: 'https://lmkfbtdvuvlrgtandcrp.supabase.co',
    key: 'sb_publishable_ApptYpHwXHkEgpc-qwhSHg_BuOfqLYp', // 修正了key大小写
    table: 'user_locations'
};

// ========== 全局变量 ==========
let supabaseClient = null;
let map = null;
let marker = null;
let currentLocation = null;
let isDbConnected = false;

// ========== DOM 元素缓存 ==========
const elements = {};

// ========== 工具函数 ==========
function show(el) {
    if (el && el.classList) {
        el.classList.remove('hidden');
        return true;
    }
    return false;
}

function hide(el) {
    if (el && el.classList) {
        el.classList.add('hidden');
        return true;
    }
    return false;
}

function updateDbStatus(message, type = 'connecting') {
    const indicator = document.getElementById('dbStatusIndicator');
    const info = document.getElementById('dbConnectionInfo');
    
    if (indicator) {
        indicator.innerHTML = `<i class="fas fa-database"></i><span>${message}</span>`;
        indicator.className = `db-status db-${type}`;
        show(indicator);
    }
    
    if (info) {
        info.textContent = message;
        info.style.color = type === 'connected' ? '#10b981' : 
                          type === 'disconnected' ? '#ef4444' : '#f59e0b';
    }
}

// ========== Supabase 初始化 ==========
function initSupabase() {
    console.log('正在初始化 Supabase...');
    
    try {
        // 检查 Supabase 库是否加载
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase 库未加载');
            updateDbStatus('Supabase 库未加载', 'disconnected');
            return false;
        }
        
        // 创建 Supabase 客户端
        supabaseClient = window.supabase.createClient(
            SUPABASE_CONFIG.url, 
            SUPABASE_CONFIG.key,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );
        
        console.log('✅ Supabase 客户端创建成功');
        updateDbStatus('数据库连接成功', 'connected');
        isDbConnected = true;
        
        // 测试连接
        testSupabaseConnection();
        
        return true;
    } catch (error) {
        console.error('❌ Supabase 初始化失败:', error);
        updateDbStatus(`数据库连接失败: ${error.message}`, 'disconnected');
        isDbConnected = false;
        
        console.log('⚠️ 数据库连接失败，但位置获取功能仍可用');
        return false;
    }
}

// 测试数据库连接
async function testSupabaseConnection() {
    if (!supabaseClient) {
        console.warn('Supabase 客户端未初始化');
        return false;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from(SUPABASE_CONFIG.table)
            .select('*')
            .limit(1);
        
        if (error) {
            console.warn('数据库连接测试警告:', error);
            
            if (error.code === '42P01') {
                updateDbStatus('user_locations 表不存在，请在Supabase控制台创建此表', 'disconnected');
                console.log('请在 Supabase 控制台创建 user_locations 表');
            } else {
                updateDbStatus(`数据库连接异常: ${error.message}`, 'disconnected');
            }
            
            return false;
        }
        
        console.log('✅ 数据库连接测试通过');
        updateDbStatus('数据库连接正常', 'connected');
        return true;
    } catch (err) {
        console.error('数据库连接测试异常:', err);
        updateDbStatus(`连接测试异常: ${err.message}`, 'disconnected');
        return false;
    }
}

// ========== 页面切换 ==========
function showMainPage() {
    console.log('切换到主页面');
    hide(document.getElementById('databasePage'));
    show(document.getElementById('mainPage'));
}

function showDatabasePage() {
    console.log('切换到数据库页面');
    hide(document.getElementById('mainPage'));
    show(document.getElementById('databasePage'));
    loadDatabaseData();
}

// ========== 位置状态管理 ==========
function showState(state) {
    console.log(`显示状态: ${state}`);
    
    const states = [
        'initialState',
        'loadingState', 
        'permissionDeniedState',
        'successState'
    ];
    
    states.forEach(stateId => {
        const el = document.getElementById(stateId);
        if (el) hide(el);
    });
    
    const targetState = document.getElementById(state + 'State');
    if (targetState) show(targetState);
}

// ========== 核心：位置获取功能 ==========
function getLocation() {
    console.log('开始获取位置...');
    
    if (!navigator.geolocation) {
        alert('您的浏览器不支持地理位置功能');
        return;
    }
    
    showState('loading');
    
    navigator.geolocation.getCurrentPosition(
        // 成功回调
        function(position) {
            console.log('✅ 位置获取成功:', position);
            
            const lat = position.coords.latitude.toFixed(6);
            const lng = position.coords.longitude.toFixed(6);
            const accuracy = Math.round(position.coords.accuracy);
            const timestamp = new Date().toLocaleString('zh-CN');
            
            // 更新显示
            document.getElementById('latitudeValue').textContent = lat;
            document.getElementById('longitudeValue').textContent = lng;
            document.getElementById('accuracyValue').textContent = `${accuracy} 米`;
            document.getElementById('timestampValue').textContent = timestamp;
            document.getElementById('addressValue').textContent = getAddress(lat, lng);
            
            // 更新地图
            updateMap(lat, lng, accuracy);
            
            // 启用按钮
            const saveLocationBtn = document.getElementById('saveLocationBtn');
            const shareLocationBtn = document.getElementById('shareLocationBtn');
            
            saveLocationBtn.disabled = false;
            saveLocationBtn.innerHTML = '<i class="fas fa-save"></i> 保存到数据库';
            shareLocationBtn.disabled = false;
            
            // 保存当前位置数据
            currentLocation = {
                latitude: parseFloat(lat),
                longitude: parseFloat(lng),
                accuracy: accuracy,
                address: getAddress(lat, lng),
                user_agent: navigator.userAgent || '未知',
                page_url: window.location.href,
                timestamp: new Date().toISOString()
            };
            
            console.log('当前位置数据:', currentLocation);
            
            showState('success');
        },
        
        // 失败回调
        function(error) {
            console.error('❌ 位置获取失败:', error);
            
            let errorMessage = '获取位置失败: ';
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage += '用户拒绝了位置请求';
                    console.log('用户拒绝了位置权限');
                    showState('permission-denied');
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage += '位置信息不可用';
                    alert(errorMessage);
                    showState('initial');
                    break;
                case error.TIMEOUT:
                    errorMessage += '请求位置超时';
                    alert(errorMessage);
                    showState('initial');
                    break;
                default:
                    errorMessage += error.message;
                    alert(errorMessage);
                    showState('initial');
            }
        },
        
        { 
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// ========== 地图功能 ==========
function initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error('找不到地图元素');
        return;
    }
    
    try {
        map = L.map('map').setView([35.0, 105.0], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        
        console.log('✅ 地图初始化成功');
        return true;
    } catch (error) {
        console.error('❌ 地图初始化失败:', error);
        return false;
    }
}

function updateMap(lat, lng, accuracy) {
    if (!map && !initMap()) {
        console.error('无法初始化地图');
        return;
    }
    
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    map.setView([latNum, lngNum], 15);
    
    if (marker) {
        map.removeLayer(marker);
    }
    
    marker = L.marker([latNum, lngNum]).addTo(map);
    marker.bindPopup(`<b>您的位置</b><br>纬度: ${lat}<br>经度: ${lng}`).openPopup();
    
    if (accuracy && accuracy > 0) {
        L.circle([latNum, lngNum], {
            color: '#4f46e5',
            fillColor: '#4f46e5',
            fillOpacity: 0.1,
            radius: accuracy
        }).addTo(map);
    }
    
    document.getElementById('mapPlaceholder').classList.add('hidden');
    document.getElementById('mapContainer').classList.remove('hidden');
}

// ========== 地址解析 ==========
function getAddress(lat, lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (latNum > 39 && latNum < 42 && lngNum > 115 && lngNum < 118) return '北京市附近';
    if (latNum > 30 && latNum < 32 && lngNum > 120 && lngNum < 122) return '上海市附近';
    if (latNum > 22 && latNum < 24 && lngNum > 113 && lngNum < 115) return '深圳市附近';
    if (latNum > 23 && latNum < 25 && lngNum > 121 && lngNum < 122) return '台湾省附近';
    if (latNum > 39 && latNum < 42 && lngNum > 125 && lngNum < 130) return '韩国附近';
    if (latNum > 35 && latNum < 37 && lngNum > 139 && lngNum < 141) return '东京附近';
    
    return `坐标位置 (${lat}, ${lng})`;
}

// ========== 数据库操作 ==========
async function saveLocationToDatabase() {
    console.log('保存位置到数据库...');
    
    if (!currentLocation) {
        alert('请先获取位置');
        return;
    }
    
    if (!supabaseClient) {
        alert('数据库未连接，无法保存位置');
        return;
    }
    
    const saveLocationBtn = document.getElementById('saveLocationBtn');
    saveLocationBtn.disabled = true;
    saveLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
    
    try {
        console.log('发送数据到数据库:', currentLocation);
        
        const { data, error } = await supabaseClient
            .from(SUPABASE_CONFIG.table)
            .insert([currentLocation])
            .select();
        
        if (error) {
            throw new Error(`数据库错误: ${error.message} (代码: ${error.code})`);
        }
        
        console.log('✅ 位置保存成功:', data);
        
        saveLocationBtn.innerHTML = '<i class="fas fa-check"></i> 保存成功';
        saveLocationBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        
        setTimeout(() => {
            saveLocationBtn.innerHTML = '<i class="fas fa-save"></i> 保存到数据库';
            saveLocationBtn.disabled = false;
            saveLocationBtn.style.background = '';
        }, 3000);
        
        alert('位置已成功保存到数据库！');
        
    } catch (error) {
        console.error('❌ 保存位置失败:', error);
        
        saveLocationBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 保存失败';
        saveLocationBtn.disabled = false;
        
        alert(`保存失败: ${error.message}\n请检查数据库连接和表结构。`);
    }
}

async function loadDatabaseData() {
    console.log('加载数据库数据...');
    
    if (!supabaseClient) {
        document.getElementById('databaseMessageText').textContent = '数据库未连接，请检查网络或数据库配置';
        return;
    }
    
    document.getElementById('databaseMessageText').textContent = '正在加载数据...';
    document.getElementById('locationsList').innerHTML = '<div class="loading-spinner"></div>';
    hide(document.getElementById('noLocationsMessage'));
    
    try {
        const { data, error } = await supabaseClient
            .from(SUPABASE_CONFIG.table)
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            throw new Error(`数据库查询错误: ${error.message} (代码: ${error.code})`);
        }
        
        console.log(`✅ 加载到 ${data?.length || 0} 条记录`);
        
        updateDatabaseStats(data || []);
        displayLocations(data || []);
        
        document.getElementById('databaseMessageText').textContent = `已加载 ${data?.length || 0} 条位置记录`;
        
    } catch (error) {
        console.error('❌ 加载数据失败:', error);
        
        document.getElementById('databaseMessageText').textContent = `加载失败: ${error.message}`;
        document.getElementById('locationsList').innerHTML = `<div class="status status-error">
            <i class="fas fa-exclamation-circle"></i>
            加载失败: ${error.message}
        </div>`;
    }
}

function updateDatabaseStats(locations) {
    const total = locations.length;
    
    document.getElementById('totalRecords').textContent = total;
    
    const today = new Date().toDateString();
    const todayCount = locations.filter(loc => {
        const locDate = new Date(loc.timestamp || loc.created_at).toDateString();
        return locDate === today;
    }).length;
    
    document.getElementById('todayRecords').textContent = todayCount;
    
    if (locations.length > 0) {
        const latest = new Date(locations[0].timestamp || locations[0].created_at);
        document.getElementById('lastUpdate').textContent = latest.toLocaleTimeString('zh-CN');
    } else {
        document.getElementById('lastUpdate').textContent = '--';
    }
    
    const dbStatusEl = document.getElementById('dbStatus');
    dbStatusEl.textContent = isDbConnected ? '正常' : '断开';
    dbStatusEl.className = isDbConnected ? 'text-lg font-bold text-green-600' : 'text-lg font-bold text-red-600';
}

function displayLocations(locations) {
    const locationsList = document.getElementById('locationsList');
    const noLocationsMessage = document.getElementById('noLocationsMessage');
    
    if (locations.length === 0) {
        locationsList.innerHTML = '';
        show(noLocationsMessage);
        return;
    }
    
    hide(noLocationsMessage);
    
    let html = '';
    locations.forEach((location, index) => {
        const lat = location.latitude || location.lat || 'N/A';
        const lng = location.longitude || location.lng || 'N/A';
        const accuracy = location.accuracy || 'N/A';
        const address = location.address || getAddress(lat, lng);
        const timestamp = location.timestamp || location.created_at;
        const date = new Date(timestamp);
        const formattedDate = date.toLocaleString('zh-CN');
        const id = location.id || `记录-${index + 1}`;
        
        html += `
            <div class="location-card">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <h4 style="font-weight: 700;">${id}</h4>
                    <button onclick="deleteLocation('${location.id}')" style="color: #ef4444; background: none; border: none; cursor: pointer; padding: 0.25rem;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; margin-bottom: 0.5rem;">
                    <div>
                        <p style="font-size: 0.875rem; color: #6b7280;">纬度</p>
                        <p style="font-weight: 600;">${lat}</p>
                    </div>
                    <div>
                        <p style="font-size: 0.875rem; color: #6b7280;">经度</p>
                        <p style="font-weight: 600;">${lng}</p>
                    </div>
                </div>
                <p style="margin-bottom: 0.25rem;"><strong>精度:</strong> ${accuracy} 米</p>
                <p style="margin-bottom: 0.25rem;"><strong>地址:</strong> ${address}</p>
                <p style="margin-bottom: 0.5rem;"><strong>时间:</strong> ${formattedDate}</p>
                <details style="font-size: 0.875rem; color: #6b7280;">
                    <summary>详细信息</summary>
                    <p style="margin-top: 0.5rem;"><strong>用户代理:</strong> ${location.user_agent || '未知'}</p>
                    <p><strong>页面URL:</strong> ${location.page_url || '未知'}</p>
                </details>
            </div>
        `;
    });
    
    locationsList.innerHTML = html;
}

async function deleteLocation(id) {
    if (!supabaseClient) {
        alert('数据库未连接');
        return;
    }
    
    if (!confirm('确定删除这条记录吗？')) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from(SUPABASE_CONFIG.table)
            .delete()
            .eq('id', id);
        
        if (error) {
            throw new Error(`删除失败: ${error.message}`);
        }
        
        console.log('✅ 记录删除成功');
        alert('记录已删除');
        loadDatabaseData();
    } catch (error) {
        console.error('❌ 删除记录失败:', error);
        alert(`删除失败: ${error.message}`);
    }
}

async function clearAllData() {
    if (!supabaseClient) {
        alert('数据库未连接');
        return;
    }
    
    if (!confirm('警告：这将删除数据库中的所有位置记录！此操作不可撤销。确定继续吗？')) {
        return;
    }
    
    const clearAllBtn = document.getElementById('clearAllBtn');
    clearAllBtn.disabled = true;
    clearAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 清空中...';
    
    try {
        const { error } = await supabaseClient
            .from(SUPABASE_CONFIG.table)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) {
            throw new Error(`清空失败: ${error.message}`);
        }
        
        console.log('✅ 所有数据已清空');
        alert('所有数据已清空');
        
        clearAllBtn.innerHTML = '<i class="fas fa-check"></i> 已清空';
        
        setTimeout(() => {
            clearAllBtn.innerHTML = '<i class="fas fa-trash"></i> 清空数据';
            clearAllBtn.disabled = false;
        }, 2000);
        
        loadDatabaseData();
    } catch (error) {
        console.error('❌ 清空数据失败:', error);
        
        clearAllBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 清空失败';
        alert(`清空失败: ${error.message}`);
    }
}

function shareLocation() {
    if (!currentLocation) {
        alert('请先获取位置');
        return;
    }
    
    const text = `我的位置: ${currentLocation.latitude}, ${currentLocation.longitude}`;
    const url = `https://www.openstreetmap.org/?mlat=${currentLocation.latitude}&mlon=${currentLocation.longitude}`;
    
    if (navigator.share) {
        navigator.share({ title: '我的位置', text, url });
    } else {
        navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
            const shareLocationBtn = document.getElementById('shareLocationBtn');
            shareLocationBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
            shareLocationBtn.disabled = true;
            
            setTimeout(() => {
                shareLocationBtn.innerHTML = '<i class="fas fa-share-alt"></i> 分享位置';
                shareLocationBtn.disabled = false;
            }, 2000);
            
            alert('位置信息已复制到剪贴板');
        }).catch(err => {
            console.error('复制失败:', err);
            alert('复制失败，请手动复制位置信息');
        });
    }
}

// ========== 事件监听器 ==========
function setupEventListeners() {
    console.log('设置事件监听器...');
    
    document.getElementById('viewLocationsBtn').addEventListener('click', showDatabasePage);
    document.getElementById('backToMainBtn').addEventListener('click', showMainPage);
    document.getElementById('goToMainBtn').addEventListener('click', showMainPage);
    document.getElementById('refreshDataBtn').addEventListener('click', loadDatabaseData);
    document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
    document.getElementById('getLocationBtn').addEventListener('click', getLocation);
    document.getElementById('retryPermissionBtn').addEventListener('click', getLocation);
    document.getElementById('saveLocationBtn').addEventListener('click', saveLocationToDatabase);
    document.getElementById('shareLocationBtn').addEventListener('click', shareLocation);
    
    console.log('✅ 事件监听器设置完成');
}

// ========== 初始化函数 ==========
function init() {
    console.log('========== 位置信息服务初始化开始 ==========');
    
    try {
        initSupabase();
        setupEventListeners();
        showState('initial');
        
        if (!navigator.geolocation) {
            console.warn('⚠️ 浏览器不支持地理位置功能');
            const getLocationBtn = document.getElementById('getLocationBtn');
            getLocationBtn.disabled = true;
            getLocationBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 浏览器不支持';
        } else {
            console.log('✅ 浏览器支持地理位置功能');
        }
        
        setTimeout(() => {
            if (!isDbConnected) {
                console.warn('⚠️ 数据库连接失败，但位置获取功能仍可用');
                updateDbStatus('数据库连接失败，位置获取功能仍可用', 'disconnected');
            }
        }, 3000);
        
        console.log('✅ 位置信息服务初始化完成');
        
    } catch (error) {
        console.error('❌ 初始化过程中发生错误:', error);
        alert('初始化失败: ' + error.message);
    }
}

// ========== 页面加载完成后初始化 ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ========== 导出到全局 ==========
window.LocationService = {
    supabaseClient,
    currentLocation,
    getLocation,
    saveLocationToDatabase,
    loadDatabaseData,
    deleteLocation,
    clearAllData,
    init
};