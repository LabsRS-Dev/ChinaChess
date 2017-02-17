/**
 * Created by Ian on 2014/8/10.
 * 优化
 *
 *
 * 日志：
 * 2015年10月29日 星期四 开始加入Electron引擎兼容处理工作
 * 2016年2月18日 星期四 统一升级
 * 2016年3月29日 星期二 printToPDF 添加遗忘的callback参数
 * 2016年4月29日 星期五 添加支持拖拽功能的参数说明
 * 					   兼容Electron文件拖拽功能的集成
 * 					   优化本地的Dock.Notice 部分的代码
 * 2016年5月2日15:54:27 添加兼容Google翻译的语言标识 getCompatibleGoogleLanguageInfo
 * 2016年5月26日12:03:31 添加b$.pN = b$.pNative = require("remote").require("./romanysoft/maccocojs"); // Electron引擎
 * 						支持Electron1.1.3版本的变化
 * 2016年6月4日06:54:58 针对提示升级，加入enableForMacOSAppStore 和 enableForElectron 来控制
 * 2016年7月1日11:37:11 新增获取进程参数的功能 getAppArgv
 *                      统一Notice的Alert的返回值
 *                      新增获取文件名称的方式
 * 2016年9月11日15:01:47 获取是否已经注册的接口
 * 2016年11月21日12:07:35
 *                      添加获取其他文件或目录图标路径(png格式文件)的接口
 *                      添加获取其他App的基本信息的接口
 *                      添加得到一个临时随机文件路径的接口
 * 2016年11月28日19:59:15
 *                      添加重启启动App的接口 App.relanuch
 *
 * 2016年12月1日10:04:01
 *                      补充两个获取路径的接口
 *                      (1)获得本地desktop目录路径
 *                      (2)获得本地Library目录路径
 * 2016年12月4日19:57:47
 *                      添加向后兼容性代码参数处理
 *
 * 2016年12月6日
 *                     根据演示业务需要，加强IAP内置购买的模拟测试
 *
 */

(function(factory) {
    "use strict";

    if (typeof define === "function" && define.amd) {
        define("BS.b$", ["jquery"], function() {
            return factory(jQuery || $);
        });
    } else {
        factory(jQuery || $);
    }

    if (typeof module === "object" && typeof module.exports === "object") {
        module.exports = factory(jQuery || $);
    }

}(function($) {
    "use strict";


    (function() {
        window.BS = window.BS || {};
        window.BS.b$ = window.BS.b$ || {};
    })();

    (function($) {
        $.toJSON = $.toJSON || JSON.stringify;
        var b$ = {};
        b$ = $.extend(window.BS.b$, {});
        b$.pN = b$.pNative = null;
        b$.pIsUseElectron = false; //是否使用了Electron引擎,默认是没有使用
        b$.pIsUseMacCocoEngine = false; //是否使用了MacOSX本地引擎
        if ((typeof maccocojs !== 'undefined') && (typeof maccocojs == 'object') && maccocojs.hasOwnProperty(
                "app")) {
            b$.pN = b$.pNative = maccocojs; // 原MacOSX本地引擎
            b$.pIsUseMacCocoEngine = true;
            b$.pIsUseElectron = false;
        } else if ((typeof process === 'object') && (typeof require === 'function') && (process.hasOwnProperty(
                "pid"))) {
            try {
                console.log("============= must first load =================");

                // 一定要干掉Electron的内置指定
                try {
                    window["eletron_require"] = window.require;
                    window["eletron_module"] = window.module;

                    // Electron引擎加载方式，兼容新的及老的版本。支持：最新1.1.3和0.34版本系列
                    try {
                        b$.pN = b$.pNative = require("remote").require("./romanysoft/maccocojs");
                    } catch (e) {
                        b$.pN = b$.pNative = require('electron').remote.require("./romanysoft/maccocojs");
                    }

                    window.require = undefined;
                    window.module.exports = undefined;
                    window.module = undefined;
                } catch (e) {
                    console.error(e);
                }
                // end

                b$.pIsUseElectron = true;
                b$.pIsUseMacCocoEngine = false;
                window.BS.b$ = $.extend(window.BS.b$, b$);
                console.log("============= must first load [end]=================");
            } catch (e) {
                console.log(e);
            }
        }

        // 定义临时回调处理函数定义接口
        b$._ncb_idx = 0;
        b$._get_callback = function(func, noDelete) {
            window._nativeCallback = window._nativeCallback || {};
            var _nativeCallback = window._nativeCallback;
            var r = 'ncb' + b$._ncb_idx++;
            _nativeCallback[r] = function() {
                try {
                    if (!noDelete) {
                        delete _nativeCallback[r];
                    }
                } catch (e) {
                    console.error(e)
                }
                func && func.apply(null, arguments);
            };
            return '_nativeCallback.' + r;
        };

        b$.cb_execTaskUpdateInfo = null; //执行任务的回调
        b$.pCorePlugin = { //核心处理引导插件部分,尽量不要修改
            useThread: true,
            passBack: "BS.b$.cb_execTaskUpdateInfo",
            packageMode: 'bundle',
            taskToolPath: "/Plugins/extendLoader.bundle",
            bundleClassName: "LibCommonInterface"
        };

        b$.pIAPPlugin = {
            path: "/plugin.iap.bundle"
        };


        // IAP 非本地模拟
        b$.IAP_SE_KEY = "RSSDK_SE_SANBOX_IAP";
        b$.IAP_SE_OBJ = {};
        b$.IAP_SE_Wrapper = {
            productIdentifiers:[],   //商品的ID 数组
            caller: $.Callbacks()     //消息回调处理
        };

        // IAP 功能封装
        b$.cb_handleIAPCallback = null; // IAP的回调函数
        b$.IAP = {
            NoticeCenter:$.Callbacks(), // 参照Jquery.Callbacks消息回调处理。增加动态注册监控信息的回调处理。是一种扩展
            MessageType:(function () {  // 开放内核中的消息
                var msg = [
                    ///{常用购买流程}
                    "ProductsLoaded",
                    "ProductBuyFailed",
                    "ProductPurchased",
                    "ProductPurchaseFailed",
                    "ProductPurchaseFailedDetail",
                    "ProductRequested",
                    "ProductCompletePurchased",

                    ///{恢复购买部分}
                    "ProductsPaymentQueueRestoreCompleted",
                    "ProductsPaymentRestoreCompletedTransactionsFailed",
                    "ProductsPaymentRemovedTransactions",
                    "ProductsPaymentUpdatedDownloads"
                ];

                var obj = {};
                var i = 0;
                for (i = 0; i <msg.length; ++i){
                    var msgType = msg[i];
                    obj[msgType] = msgType;
                }

                return obj;
            })(),

            data:{
                /// 产品信息是否发送请求核实并得到同步信息过。IAP机制
                productIsRequested: false,

                /// 内置产品Map
                productInfoMap:{},
                /// 内置的产品信息List
                productInfoList:[],


                ///Methods
                reInit: function(){  /// 核心重新初始化
                    var t$ = this;
                    t$.productIsRequested = false;
                    t$.productInfoMap = {};
                    t$.productInfoList = [];

                },
                getProductObj: function (productIdentifier) { /// 获取商品对象
                    var t$ = this;
                    var obj = null;
                    if (t$.productInfoMap[productIdentifier]){
                        obj = t$.productInfoMap[productIdentifier];
                    }
                    return obj;
                },
                getPrice: function (productIdentifier) {
                    var t$ = this;
                    var obj = t$.getProductObj(productIdentifier);
                    if (obj){
                        return obj.price;
                    }

                    return null;
                },
                getDescription: function (productIdentifier) {
                    var t$ = this;
                    var obj = t$.getProductObj(productIdentifier);
                    if (obj){
                        return obj.description;
                    }

                    return null;
                }

            },


            /////////////////////////////////////////////////////////////////////////////////////////////////////
            /////////////////////////////////////////////////////////////////////////////////////////////////////
            /// 获取本地配置是否可以使用IAP。参见：project.json
            getEnable: function() {
                var t$ = this;
                if (b$.pN) {
                    try {
                        return b$.pN.app.getIAPEnable();
                    } catch (e) {
                        console.error(e)
                    }
                }else{
                    console.log("Romanysoft SDK simulation environment....");
                    var obj = window.localStorage.getItem(b$.IAP_SE_KEY);
                    if (!obj){
                        window.localStorage.setItem(b$.IAP_SE_KEY, JSON.stringify(b$.IAP_SE_OBJ));
                    }else{
                        b$.IAP_SE_OBJ = JSON.parse(obj);
                    }

                    return true; //非本地环境返回True，方便测试
                }
                return false;
            },

            enableIAP: function(in_parms, cb) {
                var t$ = this;

                try {
                    $.testObjectType(in_parms, 'object');

                    var parms = {};
                    parms["cb_IAP_js"] = in_parms["cb_IAP_js"] || b$._get_callback(function(obj) {
                        //////////////////////////内部处理//////////////////////////////////
                        try{
                            if ($.isPlainObject(obj)){
                                var info = obj.info;
                                var notifyType = obj.notifyType;

                                if(notifyType == t$.MessageType["ProductRequested"]){
                                    if(typeof info == "string"){
                                        info = JSON.parse(info);
                                    }

                                    t$.data.productIsRequested = true;
                                    t$.data.productInfoList = info;

                                    $.each(t$.data.productInfoList, function(index, product){
                                       t$.data.productInfoMap[product.productIdentifier] = {
                                           productIdentifier: product.productIdentifier, // 商品ID
                                           description: product.description || "", // 商品描述
                                           buyUrl: product.buyUrl || "",     // 外部购买链接
                                           price: product.price || ""        // 价格
                                       }
                                    });
                                }

                            }
                        }catch(e){
                            console.error(e);
                        }

                        try{
                            b$.IAP.NoticeCenter.fire(obj);
                        }catch (e){}


                        ///////////////////////////外部处理/////////////////////////////////
                        if ($.isFunction(b$.cb_handleIAPCallback)) {
                            b$.cb_handleIAPCallback && b$.cb_handleIAPCallback(obj);
                        } else {
                            cb && cb(obj);
                        }

                        //////////////////////////////////////////////////////////////////
                    }, true);

                    /// 数据校验
                    console.assert($.RTYUtils.isString(parms["cb_IAP_js"]) == true, "must be function string");

                    ///Ian(原先的方式)
                    if ($.RTYUtils.isArray(in_parms["productIds"])){
                        parms["productIds"] = in_parms["productIds"] || [];
                    }

                    ///Ian 2016.12.06 现在的方式. 支持更高级的商品属性定义传入
                    parms["products"] = [];
                    if ($.RTYUtils.isArray(in_parms["products"])){ // [{productIdentifier, description, buyUrl, price}]
                        try{
                            var productIds = [];
                            $.each(in_parms["products"], function (index, product) {
                                productIds.push(product.productIdentifier);
                            });

                            if ($.RTYUtils.isUndefinedOrNull(parms["productIds"])){
                                parms["productIds"] = productIds;
                            }

                            parms["products"] = in_parms["products"];

                        }catch (e){
                            console.error(e);
                            alert(e);
                        }
                    }


                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }

                    if (b$.pN) {
                        //注册IAP回调
                        b$.pN.iap.regeditIAPCallbackJs(parms.cb_IAP_js);

                        //注册IAPBundle
                        b$.pN.iap.regeditIAPCore($.toJSON({
                            path: b$.getAppPluginDir() + b$.pIAPPlugin.path
                        }));

                        //看看是否可以购买
                        if (b$.pN.iap.canMakePayments()) {
                            //启动服务
                            b$.pN.iap.startIAPService();

                            //发送商品请求
                            b$.pN.iap.requestProducts($.toJSON({
                                productIdentifiers: parms.productIds || [],
                                products: parms["products"] || []
                            }));
                        }
                    }else{ /// 以下是Demo 处理

                        ///注册模拟IAP回调
                        b$.IAP_SE_Wrapper.caller.add(function (obj) {
                            console.assert($.RTYUtils.isString(parms.cb_IAP_js) == true, "must be function string");

                            var fnc = eval(parms.cb_IAP_js);
                            if ($.RTYUtils.isFunction(fnc)){
                                fnc && fnc(obj);
                            }
                        });

                        ///注册商品ID
                        b$.IAP_SE_Wrapper.productIdentifiers = parms.productIds || [];

                        var productsInfo = [];
                        $.each(parms.productIds, function (index, id) {
                            var productObj = {
                                productIdentifier: id,
                                description: "Plugin Description and price demo for " + id,
                                buyUrl: "",
                                price: "$0.99"
                            };

                            productsInfo.push(productObj);
                        });

                        ///模拟发送获取产品信息
                        b$.IAP_SE_Wrapper.caller.fire({
                            notifyType:t$.MessageType.ProductRequested,
                            info:productsInfo
                        });
                    }

                } catch (e) {
                    console.error(e);
                }

            },

            _rebuildInfo: function () { // 重新构建
                var t$ = this;

                try{
                    if (b$.pN) {
                        b$.pN.iap.resetAll();
                    }else{
                        window.localStorage.removeItem(b$.IAP_SE_KEY);
                    }

                    t$.data.reInit();
                }catch (e){}

            },
            _check: function (productIdentifier) { // 验证数据
                var t$ = this;

                //检测必须的参数
                console.assert($.RTYUtils.isUndefinedOrNull(productIdentifier) == false, "productIdentifier 必须赋值");
                //产品必须已经注册过
                var isExists = t$.data.productInfoMap.hasOwnProperty(productIdentifier);
                console.assert(isExists == true, "指定的productIdentifier 必须已经注册，通过EnableIAP注册接口");

                if (!isExists){
                    var msg = "Product [" + productIdentifier + "] is not registered... please see 'EnableIAP' function";
                    alert(msg);
                }

                return isExists;
            },

            /**
             * 恢复购买操作
             * @param successCallback 恢复成功后的回调, 传值参数为上的商品列表[{标识及数量}]，和消息内容
             * @param failCallback 恢复失败后的回调。原失败的内容
             */
            restore: function(successCallback, failCallback) {
                var t$ = this;

                //////////////////////////////////////////////////////////////////////////////
                var _cb = function(obj){
                    try{
                        b$.IAP.NoticeCenter.remove(_cb);
                        if ($.isPlainObject(obj)){
                            var info = obj.info;
                            var notifyType = obj.notifyType;

                            if (info.productIdentifier == parms.productIdentifier){
                                if (notifyType == t$.MessageType["ProductsPaymentQueueRestoreCompleted"]){
                                    successCallback && successCallback(info);
                                }else if (t$.MessageType["ProductsPaymentRestoreCompletedTransactionsFailed"]){
                                    failCallback && failCallback(info, obj);
                                }
                            }
                        }
                    }catch(e){
                        console.error(e);
                    }
                };

                // 注册一个消息回调
                b$.IAP.NoticeCenter.add(_cb);

                if (b$.pN) {
                    //发送购买请求
                    b$.pN.iap.restoreIAP();
                }else{
                    console.log("Romanysoft SDK simulation environment....");
                    var obj = window.localStorage.getItem(b$.IAP_SE_KEY);
                    if (obj){
                        b$.IAP_SE_OBJ = JSON.parse(obj);
                    }

                    var purchasedItemList = []; // 声明原先已经购买的商品列表

                    ///检测所有已经注册的ID
                    $.each(b$.IAP_SE_Wrapper.productIdentifiers, function (index, productID) {
                        if (b$.IAP_SE_OBJ.hasOwnProperty(productID)){

                            var quantity = b$.IAP_SE_OBJ[productID];
                            if (quantity > 0){
                                var purchasedItem = {
                                    productIdentifier: productID,
                                    quantity: quantity
                                };

                                purchasedItemList.push(purchasedItem);
                            }
                        }

                    });

                    ///模拟发送获取产品信息
                    b$.IAP_SE_Wrapper.caller.fire({
                        notifyType:t$.MessageType["ProductsPaymentQueueRestoreCompleted"],
                        info:purchasedItemList
                    });
                }
            },

            /**
             * 购买商品
             * @param parms {} 参数productIdentifier： 购买的商品唯一标识， quantity： 购买的商品数量
             * @param successCallback 购买成功后的回调, 传值参数为商品标识，和消息内容
             * @param failCallback 购买失败后的回调，传值参数为商品标识，和消息内容
             */
            buyProduct: function(parms, successCallback, failCallback) {
                var t$ = this;
                if (!t$._check(parms.productIdentifier)) return;

                //////////////////////////////////////////////////////////////////////////////
                var _cb = function(obj){
                    try{
                        b$.IAP.NoticeCenter.remove(_cb);
                        if ($.isPlainObject(obj)){
                            var info = obj.info;
                            var notifyType = obj.notifyType;

                            if (info.productIdentifier == parms.productIdentifier){
                                if (notifyType == t$.MessageType["ProductPurchased"]){
                                    successCallback && successCallback(info.productIdentifier, obj);
                                }else if (t$.MessageType["ProductPurchaseFailed"]){
                                    failCallback && failCallback(info.productIdentifier, obj);
                                }
                            }
                        }
                    }catch(e){
                        console.error(e);
                    }
                };

                // 注册一个消息回调
                b$.IAP.NoticeCenter.add(_cb);


                if (b$.pN) {
                    //发送购买请求
                    b$.pN.iap.buyProduct($.toJSON({
                        identifier: parms.productIdentifier,
                        quantity: parms.quantity || 1
                    }));
                }else{
                    console.log("Romanysoft SDK simulation environment....");
                    var obj = window.localStorage.getItem(b$.IAP_SE_KEY) || JSON.stringify({});

                    b$.IAP_SE_OBJ = JSON.parse(obj);
                    var orgQuantity = 0, saveQuantity = 0;
                    if (b$.IAP_SE_OBJ[parms.productIdentifier]){
                        orgQuantity = b$.IAP_SE_OBJ[parms.productIdentifier];
                        saveQuantity = orgQuantity + parms.quantity || 1;
                    }else{
                        saveQuantity = parms.quantity || 1;
                    }

                    b$.IAP_SE_OBJ[parms.productIdentifier] = saveQuantity;
                    window.localStorage.setItem(b$.IAP_SE_KEY, JSON.stringify(b$.IAP_SE_OBJ));

                    //模拟发送成功购买信息
                    b$.IAP_SE_Wrapper.caller.fire({
                        notifyType:t$.MessageType["ProductPurchased"],
                        info:{
                            productIdentifier: parms.productIdentifier,
                            quantity: saveQuantity
                        }
                    });

                    //模拟发送购买完成信息
                    b$.IAP_SE_Wrapper.caller.fire({
                        notifyType:t$.MessageType["ProductCompletePurchased"],
                        info:{
                            productIdentifier: parms.productIdentifier,
                            transactionId: "transactionId" + Math.round(999),
                            receipt: "receipt" + Math.round(999)
                        }
                    });
                }
            },

            getPrice: function(productIdentifier) {
                var t$ = this;
                if (!t$._check(productIdentifier)) return;

                if (b$.pN) {
                    if (b$.App.getSandboxEnable()){
                        return b$.pN.iap.getPrice(productIdentifier);
                    }else{
                        return t$.data.getPrice(productIdentifier);
                    }
                }else{
                    console.log("Romanysoft SDK simulation environment....");
                    return t$.data.getPrice(productIdentifier);
                }
            },

            getUseableProductCount: function(productIdentifier) {
                var t$ = this;
                if (!t$._check(productIdentifier)) return;

                if (b$.pN) {
                    return b$.pN.iap.getUseableProductCount(productIdentifier) || 0;
                }else{
                    console.log("Romanysoft SDK simulation environment....");
                    var quantity = 0;

                    var obj = window.localStorage.getItem(b$.IAP_SE_KEY) || JSON.stringify({});
                    if (obj){
                        b$.IAP_SE_OBJ = JSON.parse(obj);
                        quantity = b$.IAP_SE_OBJ[productIdentifier] || 0;
                    }

                    return quantity;
                }
            },

            setUseableProductCount: function(jsonObj) {
                var t$ = this;
                if (!t$._check(jsonObj.productIdentifier)) return;


                if (b$.pN) {
                    var params = {
                        identifier: jsonObj.productIdentifier || '',
                        quantity: jsonObj.quantity || 1
                    };
                    return b$.pN.iap.setUseableProductCount($.toJSON(params)) || 0;
                }else{
                    console.log("Romanysoft SDK simulation environment....");
                    var obj = window.localStorage.getItem(b$.IAP_SE_KEY)|| JSON.stringify({});
                    if (obj) {
                        b$.IAP_SE_OBJ = JSON.parse(obj);

                        var saveQuantity = jsonObj.quantity || 1;
                        b$.IAP_SE_OBJ[jsonObj.productIdentifier] = saveQuantity;
                        window.localStorage.setItem(b$.IAP_SE_KEY, JSON.stringify(b$.IAP_SE_OBJ));
                        return saveQuantity || 0;
                    }
                }

                return 0;
            },

            add1Useable: function(productIdentifier) {
                var t$ = this;
                if (!t$._check(productIdentifier)) return;

                if (b$.pN) {
                    return b$.pN.iap.add1Useable(productIdentifier) || 0;
                }else{
                    console.log("Romanysoft SDK simulation environment....");
                    var obj = window.localStorage.getItem(b$.IAP_SE_KEY)|| JSON.stringify({});
                    if (obj){
                        b$.IAP_SE_OBJ = JSON.parse(obj);

                        var orgQuantity = 0, saveQuantity = 0;
                        if (b$.IAP_SE_OBJ[productIdentifier]){
                            orgQuantity = b$.IAP_SE_OBJ[productIdentifier] || 0;
                            saveQuantity = orgQuantity + 1;
                        }

                        b$.IAP_SE_OBJ[productIdentifier] = saveQuantity;
                        window.localStorage.setItem(b$.IAP_SE_KEY, JSON.stringify(b$.IAP_SE_OBJ));

                        return saveQuantity;
                    }
                }

                return 0;
            },

            sub1Useable: function(productIdentifier) {
                var t$ = this;
                if (!t$._check(productIdentifier)) return;

                if (b$.pN) {
                    return b$.pN.iap.sub1Useable(productIdentifier) || 0;
                }else{
                    console.log("Romanysoft SDK simulation environment....");
                    var obj = window.localStorage.getItem(b$.IAP_SE_KEY)|| JSON.stringify({});
                    if (obj){
                        b$.IAP_SE_OBJ = JSON.parse(obj);

                        var orgQuantity = 0, saveQuantity = 0;
                        if (b$.IAP_SE_OBJ[productIdentifier]){
                            orgQuantity = b$.IAP_SE_OBJ[productIdentifier];
                            saveQuantity = orgQuantity - 1;
                        }

                        saveQuantity = saveQuantity > 0 ? saveQuantity : 0;
                        b$.IAP_SE_OBJ[productIdentifier] = saveQuantity;
                        window.localStorage.setItem(b$.IAP_SE_KEY, JSON.stringify(b$.IAP_SE_OBJ));

                        return saveQuantity;
                    }
                }

                return 0;
            }
        };

        /**
         * Notice 内容封装
         */
        b$.Notice = {
            alert: function(jsonObj) {
                if (b$.pN) {
                    var params = {
                        message: jsonObj.message || 'Tip',
                        title: jsonObj.title || 'Information',
                        buttons: jsonObj.buttons || ['Ok'],
                        alertType: jsonObj.alertType || 'Alert'
                    };

                    /// 统一向后兼容处理
                    for(var key in jsonObj){
                        if (jsonObj.hasOwnProperty(key)){
                            params[key] = jsonObj[key];
                        }
                    }

                    var returnValue = b$.pN.notice.alert($.toJSON(params));

                    ///Fixed: 根据Electron及本地引擎的区别来处理返回的值
                    if (b$.pIsUseElectron) {
                        return returnValue;
                    } else if (b$.pIsUseMacCocoEngine) {
                        /**
                            enum {
                               NSAlertDefaultReturn = 1,
                               NSAlertAlternateReturn = 0,
                               NSAlertOtherReturn = -1,
                               NSAlertErrorReturn = -2
                            };
                         */

                        if (returnValue === 1) return 0;
                        if (returnValue === 0) return 1;
                        if (returnValue === -1) return 2;
                        if (returnValue === -2) return 3;
                    }

                } else {
                    alert(jsonObj.message);
                }
            },

            notify: function(jsonObj, cb) {
                if (b$.pN) {
                    var params = {
                        content: jsonObj.message || 'Tip',
                        title: jsonObj.title || 'title',
                        callback: jsonObj['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true)
                    };

                    /// 统一向后兼容处理
                    for(var key in jsonObj){
                        if (jsonObj.hasOwnProperty(key)){
                            params[key] = jsonObj[key];
                        }
                    }

                    return b$.pN.notice.notify($.toJSON(params));
                } else {
                    alert(jsonObj.message);
                }
            },

            dockMessage: function(jsonObj, cb) {
                if (b$.pN) {
                    var params = {
                        content: jsonObj.message || 'Tip',
                        title: jsonObj.title || 'title',
                        callback: jsonObj['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true)
                    };

                    /// 统一向后兼容处理
                    for(var key in jsonObj){
                        if (jsonObj.hasOwnProperty(key)){
                            params[key] = jsonObj[key];
                        }
                    }

                    if (b$.pIsUseElectron) {
                        if (window.Notification) {
                            //参照HTML5 Notification API
                            //http://electron.atom.io/docs/v0.37.8/tutorial/desktop-environment-integration/
                            var _notification = new window.Notification(params.title, {
                                body: params.content
                            });
                            _notification.onclick = function() {
                                params.callback && params.callback();
                            }
                        }
                    } else {
                        return b$.pN.growl.notify($.toJSON(params));
                    }
                } else {
                    alert(jsonObj.message);
                }
            }
        };

        /**
         * App 内容封装
         */
        b$.App = {

            /// 获得App的名称
            appName: null,
            getAppName: function() {
                if (b$.pN) {
                    var t = this;
                    if (t.appName) return t.appName;
                    t.appName = b$.pN.app.getAppName();
                    return t.appName;
                }
                return "AppName";
            },

            /// 获得产品的版本
            appVersion: null,
            getAppVersion: function() {
                if (b$.pN) {
                    var t = this;
                    if (t.appVersion) return t.appVersion;
                    t.appVersion = b$.pN.app.getAppVersion();
                    return t.appVersion;
                }
                return "4.5.6";
            },

            /// 获得产品的构建包的版本
            appBuildVersion: null,
            getAppBuildVersion: function() {
                if (b$.pN) {
                    var t = this;
                    if (t.appBuildVersion) return t.appBuildVersion;
                    t.appBuildVersion = b$.pN.app.getAppBuildVersion();
                    return t.appBuildVersion;
                }
                return "201506271454";
            },

            /// 获得产品的ID
            appId: null,
            getAppId: function() {
                if (b$.pN) {
                    var t = this;
                    if (t.appId) return t.appId;
                    t.appId = b$.pN.app.getAppIdentifier();
                    return t.appId;
                }
                return "AppID";
            },

            /// 获取启动的时候进程附带的参数
            getAppArgv: function() {
                var t = this;
                if (b$.pN) {
                    return b$.pN.app.getAppArgv();
                }

                return [];
            },

            /// 获得产品的运行的操作系统及平台
            sysOS: null,
            getAppRunOnOS: function() {
                if (b$.pN && !b$.pIsUseMacCocoEngine) {
                    var t = this;
                    if (t.sysOS) return t.sysOS;
                    t.sysOS = b$.pN.app.getAppRunOnOS();
                    return t.sysOS;
                }
                return "MacOSX"; // 原生返回MacOSX，其他的参照Electron
            },

            /// 获得App是否在沙盒内
            getSandboxEnable: function() {
                if (b$.pN) {
                    var sandboxEnable = b$.pN.app.getSandboxEnable();
                    return sandboxEnable;
                }
                return false;
            },

            /// 获取App是否已经注册
            getIsRegistered: function () {
                var t$ = this;
                if (b$.pN) {
                    if (t$.getSandboxEnable()) return true;
                    return b$.pN.app.getIsRegistered();
                }
                return false;
            },

            /// 获取App内部注册信息
            getRegInfoJSONString: function() {
                if (b$.pN) {
                    var str = b$.pN.app.getRegInfoJSONString();
                    return str;
                }
                return "";
            },

            /// 获取App认证的内部序列号信息
            getSerialNumber: function() {
                try{
                    if (b$.pN) {
                        var str = b$.pN.app.getStringSerialNumber();
                        return str;
                    }
                }catch(e){
                    console.error(e);
                }

                return "";
            },

            /// 获取本地IP地址
            getLocalIP: function() {
                if (b$.pN) {
                    var str = b$.pN.app.getLocalIP();
                    return str;
                }
                return "";
            },

            /// 终止运行，退出系统
            terminate: function() {
                if (b$.pN) {
                    b$.pN.app.terminate();
                }
            },

            /// 重启启动，先退出，然后重新启动
            relaunch: function() {
                if (b$.pN) {
                    b$.pN.app.relaunch();
                }
            },

            /// 激活自己
            activate: function() {
                if (b$.pN) {
                    b$.pN.app.activate();
                }
            },

            /// 隐藏自己
            hide: function() {
                if (b$.pN) {
                    b$.pN.app.hide();
                }
            },

            /// 取消隐藏自己
            unhide: function() {
                if (b$.pN) {
                    b$.pN.app.unhide();
                }
            },

            /// 发出beep声音
            beep: function() {
                if (b$.pN) {
                    b$.pN.app.beep();
                }
            },

            /// 激活Bounce事件
            bounce: function() {
                if (b$.pN) {
                    b$.pN.app.bounce();
                }
            },


            /// 打开链接地址
            open: function(data) {
                if (b$.pN) {
                    return b$.pN.app.open(data || "http://www.baidu.com");
                } else {
                    try {
                        window.open(data);
                    } catch (e) {}

                }
            },


            /// 打开文件，使用系统默认行为
            openFileWithDefaultApp: function(filePath) {
                if (b$.pN) {
                    var _path = filePath || (b$.pN.path.tempDir() + "tmp.txt");
                    b$.pN.app.openFile(_path);
                }
            },


            /// 通过应用程序的名称，启动应用程序
            launchApplication: function(applicationName) {
                if (b$.pN) {
                    b$.pN.app.launch(applicationName || 'Safari'); //Safari.app
                }
            },

            /// 发送电子邮件
            sendEmail: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['sendAddress'] = jsonObj['sendAddress'] || "admin@gmail.com";
                        parms['toAddress'] = jsonObj['toAddress'] || "admin@gmail.com";
                        parms['subject'] = jsonObj['subject'] || "Hello";
                        parms['body'] = jsonObj['body'] || "Hello!!";

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }


                        b$.pN.app.sendEmailWithMail($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    alert('启动发送邮件')
                }
            },


            //{开启启动部分}
            //是否开启自动启动{苹果商店App 无效}
            isStartAtLogin: function() {
                if (b$.pN) {
                    return b$.pN.app.isStartAtLogin();
                }

                return false;
            },

            //开启自动启动功能{苹果商店App 无效}
            setStartAtLogin: function(enable) {
                if (b$.pN) {
                    return b$.pN.app.setStartAtLogin(enable); //备注：沙盒状态下无效
                }
            },

            //{NSUserDefaults}
            //存储信息{key: value: }方式,Map方式
            setInfoToUserDefaults: function(jsonObj) {
                if (b$.pN) {
                    var obj = jsonObj || {
                        callback: 'console.log',
                        key: '',
                        value: ''
                    };

                    /// 统一向后兼容处理
                    for(var key in jsonObj){
                        if (jsonObj.hasOwnProperty(key)){
                            obj[key] = jsonObj[key];
                        }
                    }

                    b$.pN.window.setInfoToUserDefaults($.toJSON(obj));
                }
            },
            //获取存储信息{key: value: }方式,Map方式
            getInfoFromUserDefaults: function(jsonObj) {
                if (b$.pN) {
                    var obj = jsonObj || {
                        callback: 'console.log',
                        key: ''
                    };

                    /// 统一向后兼容处理
                    for(var key in jsonObj){
                        if (jsonObj.hasOwnProperty(key)){
                            obj[key] = jsonObj[key];
                        }
                    }

                    b$.pN.window.getInfoFromUserDefaults($.toJSON(obj));
                }
            },
            //移除存储信息{key: value: }方式,Map方式
            removeItemFromUserDefaults: function(jsonObj) {
                if (b$.pN) {
                    var obj = jsonObj || {
                        callback: 'console.log',
                        key: ''
                    };
                    /// 统一向后兼容处理
                    for(var key in jsonObj){
                        if (jsonObj.hasOwnProperty(key)){
                            obj[key] = jsonObj[key];
                        }
                    }


                    b$.pN.window.removeItemFromUserDefaults($.toJSON(obj));
                }
            },

            ///{方便函数，设置评价App功能是否开启}
            setOptions_RateAppClose: function(enable) {
                b$.App.setInfoToUserDefaults({
                    key: 'RateApp_CLOSE',
                    value: enable
                });
            },


            ///{获取开通的服务器端口}
            getServerPort: function() {
                var default_port = 8888;
                if (b$.pN) {
                    return b$.pN.app.getHttpServerPort() || default_port;
                }

                return default_port;
            },

            /// 获得App的插件目录
            getAppPluginDir: b$.getAppPluginDir = function() {
                if (b$.pN) {
                    return b$.pN.path.appPluginDirPath();
                }
                return "";
            },

            /// 获得Application的Resource目录
            getAppResourceDir: b$.getAppResourceDir = function() {
                if (b$.pN) {
                    return b$.pN.path.resource();
                }
                return "";
            },

            /// 获得Public目录
            getAppResourcePublicDir: b$.getAppResourcePublicDir = function() {
                if (b$.pN) {
                    return b$.pN.path.resource() + "/public";
                }
                return "";
            },

            /// 获得App的包的目录
            getAppBundlePath: function() {
                if (b$.pN) {
                    return b$.pN.path.application();
                }
                return "";
            },

            /// 获得AppDataHomeDir
            getAppDataHomeDir: function() {
                if (b$.pN) {
                    return b$.pN.path.appDataHomeDir();
                }
                return "";
            },

            /// 获得Home Directory
            getHomeDir: function() {
                if (b$.pN) {
                    return b$.pN.path.homeDir();
                }
                return "";
            },

            /// 获得DocumentsDir
            getDocumentsDir: function() {
                if (b$.pN) {
                    return b$.pN.path.documentsDir();
                }
                return "";
            },

            /// 获得本地Documents目录
            getLocalDocumentsDir: function() {
                if (b$.pN) {
                    return b$.pN.path.localDocumentsDir();
                }
                return "";
            },

            /// 获得LibraryDir
            getLibraryDir: function() {
                if (b$.pN) {
                    return b$.pN.path.libraryDir();
                }
                return "";
            },

            /// 获得临时目录
            getTempDir: function() {
                if (b$.pN) {
                    return b$.pN.path.tempDir();
                }
                return "";
            },

            /// 获得Cache目录
            getCacheDir: function() {
                if (b$.pN) {
                    return b$.pN.path.cacheDir();
                }
                return "";
            },

            /// 获得Application目录
            getApplicationDir: function() {
                if (b$.pN) {
                    return b$.pN.path.applicationDir();
                }
                return "";
            },

            /// 获得DesktopDir，桌面路径
            getDesktopDir: function() {
                if (b$.pN) {
                    return b$.pN.path.desktopDir();
                }
                return "";
            },

            /// 获得downloadDir，下载目录路径
            getDownloadDir: function() {
                if (b$.pN) {
                    return b$.pN.path.downloadDir();
                }
                return "";
            },

            /// 获得本地download目录路径
            getLocalDownloadDir: function() {
                if (b$.pN) {
                    return b$.pN.path.localDownloadDir();
                }
                return "";
            },

            /// 获得本地desktop目录路径
            getLocalDesktopDir:function() {
                if (b$.pN) {
                    return b$.pN.path.localDesktopDir();
                }
                return "";
            },

            /// 获得本地Library目录路径
            getLocalLibraryDir:function() {
                if (b$.pN) {
                    return b$.pN.path.localLibraryDir();
                }
                return "";
            },

            /// 获得Movies目录路径
            getMoviesDir: function() {
                if (b$.pN) {
                    return b$.pN.path.moviesDir();
                }
                return "";
            },

            /// 获得本地Movies目录路径
            getLocalMoviesDir: function() {
                if (b$.pN) {
                    return b$.pN.path.localMoviesDir();
                }
                return "";
            },

            /// 获得Music目录
            getMusicDir: function() {
                if (b$.pN) {
                    return b$.pN.path.musicDir();
                }
                return "";
            },

            /// 获得本地Music目录
            getLocalMusicDir: function() {
                if (b$.pN) {
                    return b$.pN.path.localMusicDir();
                }
                return "";
            },


            /// 获得Pictures目录
            getPicturesDir: function() {
                if (b$.pN) {
                    return b$.pN.path.picturesDir();
                }
                return "";
            },

            /// 获得本地Pictures目录
            getLocalPicturesDir: function() {
                if (b$.pN) {
                    return b$.pN.path.localPicturesDir();
                }
                return "";
            },

            /// 获得UserName
            getUserName: function() {
                if (b$.pN) {
                    return b$.pN.path.userName();
                }
                return "";
            },

            /// 获得User全名(UserFullName)
            getUserFullName: function() {
                if (b$.pN) {
                    return b$.pN.path.userFullName();
                }
                return "";
            },


            /// 获得沙盒状态下可写入的Documents路径
            getWritableDocumentsDir: function() {
                if (b$.pN) {
                    return b$.pN.path.appWriteableDocumentDir();
                }
                return "";
            },
            /// 获得沙盒状态下可写入的Download路径
            getWritableDownloadDir: function() {
                if (b$.pN) {
                    return b$.pN.path.appWriteableDownloadDir();
                }
                return "";
            },
            /// 获得沙盒状态下可写入的Music路径
            getWritableMusicDir: function() {
                if (b$.pN) {
                    return b$.pN.path.appWriteableMusicDir();
                }
                return "";
            },
            /// 获得沙盒状态下可写入的Movies路径
            getWritableMoviesDir: function() {
                if (b$.pN) {
                    return b$.pN.path.appWriteableMoviesDir();
                }
                return "";
            },
            /// 获得沙盒状态下可写入的Pictures路径
            getWritablePicturesDir: function() {
                if (b$.pN) {
                    return b$.pN.path.appWriteablePicturesDir();
                }
                return "";
            },



            /// 检测路径是否存在
            checkPathIsExist: b$.pathIsExist = function(path) {
                if ($.trim(path) === "") return false;

                if (b$.pN) {
                    var _path = path || b$.pN.path.tempDir();
                    return b$.pN.path.pathIsExist(_path);
                }

                return true;
            },

            ///文件是否为0Byte
            checkFileIsZero: b$.checkFileIsZeroSize = function(file_path) {
                if ($.trim(file_path) === "") return false;

                if (b$.pN) {
                    var _path = file_path || b$.pN.path.tempDir();
                    return b$.pN.path.fileIsZeroSize(_path);
                }

                return false;
            },

            ///路径是否可以写
            checkPathIsWritable: b$.checkPathIsWritable = function(path) {
                if ($.trim(path) === "") return false;

                if (b$.pN) {
                    var _path = path || b$.pN.path.tempDir();
                    return b$.pN.path.checkPathIsWritable(_path);
                }

                return true;
            },

            ///创建空文件
            createEmptyFile: b$.createEmptyFile = function(file_path, cb) {
                if (b$.pN) {
                    var _path = file_path || (b$.pN.path.tempDir() + "tmp.txt");
                    return b$.pN.window.createEmptyFile($.toJSON({
                        path: _path,
                        callback: b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true)
                    }));
                }
            },

            ///创建目录
            createDir: b$.createDir = function(dir_path, atts, cb) {
                if (b$.pN) {
                    try {
                        var parms = {};
                        //限制内部属性：
                        parms['callback'] = parms['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true);
                        parms['path'] = dir_path || (b$.pN.path.tempDir() + "tmp_dir001");
                        if (atts) parms['atts'] = atts || {};

                        b$.pN.window.createDir($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            ///删除文件
            removeFile: b$.removeFile = function(file_path, cb) {
                if (b$.pN) {
                    var _path = file_path || (b$.pN.path.tempDir() + "tmp.txt");
                    return b$.pN.window.removeFile($.toJSON({
                        path: _path,
                        callback: b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true)
                    }));
                }
            },

            ///删除目录
            removeDir: b$.removeDir = function(dir_path, cb) {
                if (b$.pN) {
                    try {
                        var parms = {};
                        //限制内部属性：
                        parms['callback'] = parms['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true);
                        parms['path'] = dir_path || (b$.pN.path.tempDir() + "/tmp_dir001");


                        b$.pN.window.removeDir($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            ///拷贝文件
            copyFile: b$.copyFile = function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['callback'] = jsonObj['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true);
                        parms['src'] = jsonObj['src'] || "";
                        parms['dest'] = jsonObj['dest'] || "";

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.copyFile($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            ///拷贝目录
            copyDir: b$.copyDir = function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['callback'] = jsonObj['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true);
                        parms['src'] = jsonObj['src'] || "";
                        parms['dest'] = jsonObj['dest'] || "";

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.copyDir($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            ///移动文件
            moveFile: b$.moveFile = function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['callback'] = jsonObj['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true);
                        parms['src'] = jsonObj['src'] || "";
                        parms['dest'] = jsonObj['dest'] || "";

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.moveFile($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            ///移动目录
            moveDir: b$.moveDir = function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['callback'] = jsonObj['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true);
                        parms['src'] = jsonObj['src'] || "";
                        parms['dest'] = jsonObj['dest'] || "";

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.moveDir($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            ///查找文件是否在此目录中存在
            findFile: b$.findFile = function(dir, fileName, cbName, cb) {
                if (b$.pN) {
                    var _dir = dir || b$.pN.path.tempDir();
                    var _fileName = fileName || 'tmp.txt';

                    var parms = {
                        callback: cbName || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true),
                        dir: _dir,
                        fileName: _fileName
                    };

                    return b$.pN.window.findFile($.toJSON(parms));
                }

                return null;
            },

            ///判断路径是否可读
            checkPathIsReadable: function(path) {
                if (b$.pN) {
                    var _path = path || b$.pN.path.tempDir();
                    return b$.pN.path.checkPathIsReadable(_path);
                }

                return false;
            },

            ///判断路径是否可运行
            checkPathIsExecutable: function(path) {
                if (b$.pN) {
                    var _path = path || b$.pN.path.tempDir();
                    return b$.pN.path.checkPathIsExecutable(_path);
                }

                return false;
            },

            ///判断路径是否可删除
            checkPathIsDeletable: function(path) {
                if (b$.pN) {
                    var _path = path || b$.pN.path.tempDir();
                    return b$.pN.path.checkPathIsDeletable(_path);
                }

                return false;
            },


            ///判断是否为文件
            checkPathIsFile: function(path) {
                if (b$.pN) {
                    var _path = path || b$.pN.path.tempDir();
                    return b$.pN.path.checkPathIsFile(_path);
                }

                return false;
            },

            ///判断是否为目录
            checkPathIsDir: function(path) {
                if (b$.pN) {
                    var _path = path || b$.pN.path.tempDir();
                    return b$.pN.path.checkPathIsDir(_path);
                }

                return false;
            },

            getFileName: function(path) {
                if (b$.pN) {
                    var _path = path || (b$.pN.path.tempDir() + "tmp.txt");
                    return b$.pN.path.getFileName(_path);
                }

                return "";
            },

            ///获取文件扩展名
            getFileExt: function(path) {
                if (b$.pN) {
                    var _path = path || (b$.pN.path.tempDir() + "tmp.txt");
                    return b$.pN.path.getFileExt(_path);
                }

                return "";
            },

            ///获取路径上一级目录路径
            getPathParentPath: function(path) {
                if (b$.pN) {
                    var _path = path || b$.pN.path.tempDir();
                    return b$.pN.path.getPathParentPath(_path);
                }

                return "";
            },


            ///获取文件的基本属性
            getFilePropertyJSONString: function(path) {
                if (b$.pN) {
                    var _path = path || (b$.pN.path.tempDir() + "tmp.txt");
                    return b$.pN.path.getFilePropertyJSONString(_path);
                }

                return "";
            },

            ///获取文件或目录的系统图标路径，返回的是png方式
            getFileOrDirIconPath: function(path) {
                if (b$.pN) {
                    var _path = path || (b$.pN.path.tempDir() + "tmp.txt");
                    return b$.pN.path.getFileOrDirIconPath(_path);
                }

                return "";
            },

            /// 获取临时文件的路径
            getNewTempFilePath: function (fileName) {
                if (b$.pN) {
                    return b$.pN.path.getNewTempFilePath(fileName || "rs.txt"); // fileName 文件名称
                }

                return "";
            },

            ///获取其他App的基本信息
            /**
             *
             * @param path 路径
             * @param cb   回调函数
             * 返回的值的样例：
             *
             */
            getOtherAppInfo: function(path, cb){
                if (b$.pN) {
                    try {
                        var parms = {};
                        //限制内部属性：
                        parms['callback'] = parms['callback'] || b$._get_callback(function(obj) {
                                cb && cb(obj);
                            }, true);
                        parms['path'] = path || (b$.pN.path.tempDir() + "/tmp_dir001");


                        return b$.pN.window.getOtherAppInfo($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }

                return "";
            },

            /**
             * 获取格式化后的字符串。主要是用动态变量来处理
             * 支持如下变量：
             * ${HOME}
             * ${BUNDLE}
             * ${BUNDEL_RESOURCE}
             * ${BUNDEL_PLUGIN}
             * ${DOCUMENTS}
             * ${LIBRARY}
             * ${TEMP}
             * ${CACHE}
             * ${APPLICATION}
             * ${DESKTOP}
             * ${DOWNLOAD}
             * ${MOVIES}
             * ${MUSIC}
             * ${PICTURES}
             * ${APPW_DOCUMENTS}
             * ${APPW_DOWNLOAD}
             * ${APPW_MOVIES}
             * ${APPW_MUSIC}
             * ${APPW_PICTURES}
             * ${LOCAL_DESKTOP}
             * ${LOCAL_DOWNLOAD}
             * ${LOCAL_MOVIES}
             * ${LOCAL_MUSIC}
             * ${LOCAL_PICTURES}
             * ${LOCAL_LIBRARY}
             * ${LOCAL_DOCUMENTS}
             * ${USER_NAME}
             * ${USER_FULL_NAME}
             * ${APPDATA_HOME}
             * ${APP_UI_DIR}
             * ${APP_NAME}
             * ${APP_VERSION}
             * ${APP_BUILD_VERSION}
             * ${APP_ID}
             * @param str
             * @returns {*}
             */
            getUpdateEnvString: function (str) {
                if (b$.pN) {
                    try {
                        return b$.pN.path.getUpdateEnvString(str);
                    } catch (e) {
                        console.error(e);
                    }
                }

                return "";
            },


            ///获得文件/目录size(实际字节数 1024)
            fileSizeAtPath: function(path) {
                if (b$.pN) {
                    var _path = path || (b$.pN.path.tempDir() + "tmp.txt");
                    return b$.pN.app.fileSizeAtPath(_path);
                }

                return "";
            },

            ///获得文件/目录占用磁盘(字节数 1000)
            diskSizeAtPath: function(path) {
                if (b$.pN) {
                    var _path = path || (b$.pN.path.tempDir() + "tmp.txt");
                    return b$.pN.app.diskSizeAtPath(_path);
                }

                return "";
            },

            ///获得字符串的md5值
            md5Digest: function(str) {
                if (b$.pN) {
                    return b$.pN.app.md5Digest(str || "testMd5");
                }

                return "";
            },

            ///{扩展}
            getBuyURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getBuyURL();
                }
                return "";
            },

            getFAQURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getFAQURL();
                }
                return "";
            },

            getHomePageURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getHomePageURL();
                }
                return "";
            },

            getDocumentPageURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getDocumentPageURL();
                }
                return "";
            },

            getRoadmapPageURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getRoadmapPageURL();
                }
                return "";
            },

            getReportIssuePageURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getReportIssuePageURL();
                }
                return "";
            },

            getViewLicensePageURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getViewLicensePageURL();
                }
                return "";
            },

            getReleaseNotesPageURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getReleaseNotesPageURL();
                }
                return "";
            },

            getCheckForUpdatePageURL: function () {
                if (b$.pN) {
                    return b$.pN.app.getCheckForUpdatePageURL();
                }
                return "";
            },


            ///获得当前苹果操作系统本地的语言
            getAppleLanguage: function() {
                if (b$.pN) {
                    return b$.pN.app.curAppleLanguage();
                }

                return "en-US";
            },


            /// 获取兼容Google翻译的语言标识信息
            getCompatibleGoogleLanguageInfo: function() {
                var info = {
                    "auto": {
                        "af": "Spoor taal",
                        "sq": "Zbulo gjuhën",
                        "ar": "الكشف عن اللغة",
                        "hy": "Հայտնաբերել լեզուն",
                        "az": "Dil aşkar",
                        "eu": "Hizkuntza atzeman",
                        "be": "Вызначыць мову",
                        "bn": "ভাষা সনাক্ত করুন",
                        "bs": "Detect jeziku",
                        "bg": "Разпознаване на езика",
                        "ca": "Detectar idioma",
                        "ceb": "Makamatikod pinulongan",
                        "ny": "azindikire chinenero",
                        "zh-CN": "检测语言",
                        "zh-TW": "檢測語言",
                        "hr": "Otkrij jezik",
                        "cs": "Rozpoznat jazyk",
                        "da": "Registrer sprog",
                        "nl": "Detect taal",
                        "en": "Detect language",
                        "eo": "Detekti lingvo",
                        "et": "Tuvasta keel",
                        "tl": "Alamin ang wika",
                        "fi": "Tunnista kieli",
                        "fr": "Détecter la langue",
                        "gl": "Detectar idioma",
                        "ka": "ენის განსაზღვრა",
                        "de": "Sprache erkennen",
                        "el": "Εντοπισμός γλώσσας",
                        "gu": "ભાષા શોધો",
                        "ht": "Detekte lang",
                        "ha": "Gano harshen",
                        "iw": "אתר שפה",
                        "hi": "भाषा का पता लगाने",
                        "hmn": "Ntes lus",
                        "hu": "Nyelv felismerése",
                        "is": "Greina tungumál",
                        "ig": "Ịchọpụta asụsụ",
                        "id": "Deteksi bahasa",
                        "ga": "Braith teanga",
                        "it": "Rileva lingua",
                        "ja": "言語を検出",
                        "jw": "Ndeteksi basa",
                        "kn": "ಭಾಷೆಯನ್ನು ಪತ್ತೆಮಾಡಿ",
                        "kk": "тілін анықтау",
                        "km": "រក​ឃើញ​ភាសា",
                        "ko": "언어 감지",
                        "lo": "ພາ​ສາ​ການ​ກວດ​ສອບ",
                        "la": "Deprehendere linguae",
                        "lv": "Noteikt valodu",
                        "lt": "Aptikti kalbą",
                        "mk": "Откривање на јазик",
                        "ms": "Kesan bahasa",
                        "ml": "ഭാഷ തിരിച്ചറിയുക",
                        "mt": "Jindunaw lingwa",
                        "mi": "Kitea te reo",
                        "mr": "भाषा शोधा",
                        "mn": "Хэл илрүүлэх",
                        "my": "ဘာသာစကား detect",
                        "ne": "भाषा पत्ता लगाउनुहोस्",
                        "no": "Detect språk",
                        "fa": "تشخیص زبان",
                        "pl": "Wykryj język",
                        "pt": "Detectar idioma",
                        "pa": "ਭਾਸ਼ਾ ਦੀ ਖੋਜਣਾ ਹੈ",
                        "ma": "ਭਾਸ਼ਾ ਖੋਜ",
                        "ro": "Detecta limbă",
                        "ru": "Определить язык",
                        "sr": "Откриј језик",
                        "st": "khona ho utloa puo",
                        "si": "භාෂාවක් අනාවරණය",
                        "sk": "Rozpoznať jazyk",
                        "sl": "Zaznaj jezik",
                        "so": "Ogaado luqadda",
                        "es": "Detectar idioma",
                        "sw": "Kuchunguza lugha",
                        "sv": "Identifiera språk",
                        "tg": "ошкор забон",
                        "ta": "மொழியைக் கண்டறி",
                        "te": "భాషను కనుగొను",
                        "th": "ตรวจหาภาษา",
                        "tr": "Dili algıla",
                        "uk": "Визначити мову",
                        "ur": "زبان کا پتہ لگانے",
                        "uz": "tilni aniqlash",
                        "vi": "Phát hiện ngôn ngữ",
                        "cy": "Canfod iaith",
                        "yi": "דעטעקט שפּראַך",
                        "yo": "Ri ede",
                        "zu": "Thola ulimi"
                    },
                    "local": {
                        "af": "Afrikaans",
                        "sq": "Shqiptar",
                        "ar": "العربية",
                        "hy": "Հայերեն",
                        "az": "Azərbaycan",
                        "eu": "Euskal",
                        "be": "Беларуская",
                        "bn": "বাঙ্গালী",
                        "bs": "Bosanski",
                        "bg": "Български",
                        "ca": "Català",
                        "ceb": "Cebuano",
                        "ny": "Chichewa",
                        "zh-CN": "简体中文",
                        "zh-TW": "繁体中文",
                        "hr": "Hrvatski",
                        "cs": "Čeština",
                        "da": "Dansk",
                        "nl": "Nederlands",
                        "en": "English",
                        "eo": "Esperanto",
                        "et": "Eesti",
                        "tl": "Pilipino",
                        "fi": "Suomi",
                        "fr": "Français",
                        "gl": "Galega",
                        "ka": "ქართული",
                        "de": "Deutsch",
                        "el": "Ελληνικά",
                        "gu": "ગુજરાતી",
                        "ht": "Kreyòl ayisyen",
                        "ha": "Hausa",
                        "iw": "עברית",
                        "hi": "हिन्दी",
                        "hmn": "Hmoob",
                        "hu": "Magyar",
                        "is": "Icelandic",
                        "ig": "Igbo",
                        "id": "Indonesia",
                        "ga": "Gaeilge",
                        "it": "Italiano",
                        "ja": "日本の",
                        "jw": "Jawa",
                        "kn": "ಕನ್ನಡ",
                        "kk": "Қазақ",
                        "km": "ខ្មែរ",
                        "ko": "한국의",
                        "lo": "ລາວ",
                        "la": "Latine",
                        "lv": "Latvijas",
                        "lt": "Lietuvos",
                        "mk": "Македонски",
                        "ms": "Melayu",
                        "ml": "മലയാളം",
                        "mt": "Malti",
                        "mi": "Maori",
                        "mr": "मराठी",
                        "mn": "Монгол",
                        "my": "မြန်မာ (ဗမာ)",
                        "ne": "नेपाली",
                        "no": "Norsk",
                        "fa": "فارسی",
                        "pl": "Polski",
                        "pt": "Português",
                        "pa": "ਪੰਜਾਬੀ ਦੇ",
                        "ma": "ਪੰਜਾਬੀ ਦੇ",
                        "ro": "Român",
                        "ru": "Русский",
                        "sr": "Српски",
                        "st": "Sesotho",
                        "si": "සිංහල",
                        "sk": "Slovenský",
                        "sl": "Slovenščina",
                        "so": "Somali",
                        "es": "Español",
                        "sw": "Kiswahili",
                        "sv": "Svenska",
                        "tg": "тоҷик",
                        "ta": "தமிழ்",
                        "te": "తెలుగు",
                        "th": "ไทย",
                        "tr": "Türk",
                        "uk": "Український",
                        "ur": "اردو",
                        "uz": "O'zbekiston",
                        "vi": "Tiếng Việt",
                        "cy": "Cymraeg",
                        "yi": "ייִדיש",
                        "yo": "Yoruba",
                        "zu": "Zulu"
                    }
                };

                return info;
            },


            ///获得兼容浏览器的语言标识, 发起者，为Native
            getCompatibleWebkitLanguageList: function(_getType) {

                var getType = _getType || 'Native2Webkit'; // 获取类型，默认是获取兼容WebKit的语言标识数组

                var defaultLanguage = 'en';
                //本地对应浏览器的语言标识
                var NativeApple2WebKit_LanguageMap = {
                    'Unknown': [''],
                    'en': ['en', 'en-US', 'en-us'] // 英语
                        ,
                    'fr': ['fr', 'fr-FR', 'fr-fr'] // French (fr) 法语
                        ,
                    'de': ['de', 'de-DE', 'de-de'] // German (de) 德语
                        ,
                    'zh-Hans': ['zh', 'zh-CN', 'zh-cn', 'zh-Hans'] // Chinese (Simplified) (zh-Hans) 中文简体
                        ,
                    'zh-Hant': ['zh-TW', 'zh-tw', 'zh-Hant'] // Chinese (Traditional) (zh-Hant) 中文繁体
                        ,
                    'ja': ['ja', 'ja-JP', 'ja-jp'] // Japanese (ja) 日语
                        ,
                    'es': ['es', 'es-ES', 'es-es'] // Spanish (es) 西班牙语
                        ,
                    'es-MX': ['es-MX', 'es-XL', 'es-xl'] // Spanish (Mexico) (es-MX) 西班牙语（墨西哥）
                        ,
                    'it': ['it', 'it-IT', 'it-it'] // Italian (it) 意大利语
                        ,
                    'nl': ['nl', 'nl-NL', 'nl-nl'] // Dutch (nl) 荷兰语
                        ,
                    'ko': ['ko', 'ko-KR', 'ko-kr'] // Korean (ko) 韩语
                        ,
                    'pt': ['pt', 'pt-BR', 'pt-br'] // Portuguese (pt) 葡萄牙语
                        ,
                    'pt-PT': ['pt-PT', 'pt-pt'] // Portuguese (Portugal) (pt) 葡萄牙语（葡萄牙）
                        ,
                    'da': ['da', 'da-DK', 'da-da'] // Danish (da) 丹麦语
                        ,
                    'fi': ['fi', 'fi-FI', 'fi-fi'] // Finnish (fi) 芬兰语
                        ,
                    'nb': ['nb', 'nb-NO', 'nb-no'] // Norwegian Bokmal (nb) 挪威语
                        ,
                    'sv': ['sv', 'sv-SE', 'sv-se'] // Swedish (sv) 瑞典语
                        ,
                    'ru': ['ru', 'ru-RU', 'ru-ru'] // Russian (ru) 俄语
                        ,
                    'pl': ['pl', 'pl-PL', 'pl-pl'] // Polish (pl) 波兰语
                        ,
                    'tr': ['tr', 'tr-TR', 'tr-tr'] // Turkish (tr) 土耳其语
                        ,
                    'ar': ['ar', 'AR'] // Arabic (ar) 阿拉伯语
                        ,
                    'th': ['th', 'th-TH', 'th-th'] // Thai (th) 泰语
                        ,
                    'cs': ['cs', 'cs-CZ', 'cs-cz'] // Czech (cs) 捷克语
                        ,
                    'hu': ['hu', 'hu-HU', 'hu-hu'] // Hungarian (hu) 匈牙利语
                        ,
                    'ca': ['ca', 'ca-ES', 'ca-es'] // Catalan (ca) 加泰罗尼亚语
                        ,
                    'hr': ['hr', 'hr-HR', 'hr-hr'] // Croatian (hr) 克罗地亚语
                        ,
                    'el': ['el', 'el-GR', 'el-gr'] // Greek (el) 希腊语
                        ,
                    'he': ['he', 'he-IL', 'he-il'] // Hebrew (he) 希伯来语
                        ,
                    'ro': ['ro', 'ro-RO', 'ro-ro'] // Romanian (ro) 罗马尼亚语
                        ,
                    'sk': ['sk', 'sk-SK', 'sk-sk'] // Slovak (sk) 斯洛伐克语
                        ,
                    'uk': ['uk', 'uk-UA', 'uk-ua'] // Ukrainian (uk) 乌克兰语
                        ,
                    'id': ['id', 'ID', 'id-ID', 'id-id'] // Indonesian (id) 印尼语
                        ,
                    'ms': ['ms', 'MS', 'ms-MS', 'ms-ms'] // Malay (ms) 马来西亚语
                        ,
                    'vi': ['vi', 'vi-VN', 'vi-vn'] // Vietnamese (vi) 越南语
                };

                if (getType === 'Native2Webkit') { // 先获取Native的语言，然后查找Map
                    var apple_lng = 'en-US';
                    if (b$.pN) {
                        apple_lng = b$.pN.app.curAppleLanguage();
                    }

                    if (NativeApple2WebKit_LanguageMap.hasOwnProperty(apple_lng)) {
                        return NativeApple2WebKit_LanguageMap[apple_lng];
                    }

                    return NativeApple2WebKit_LanguageMap[defaultLanguage];
                } else if (getType === 'webkitCompatible') {
                    var mapValue = null,
                        webLanguage = navigator.language || 'en';

                    var inArray = function(value, array) {
                        if (Array.prototype.indexOf) {
                            return array.indexOf(value);
                        } else {
                            for (var i = 0; i < array.length; i++) {
                                if (array[i] === value) return i;
                            }
                            return -1;
                        }
                    };

                    for (var key in NativeApple2WebKit_LanguageMap) {
                        if (NativeApple2WebKit_LanguageMap.hasOwnProperty(key)) {
                            var languageArray = NativeApple2WebKit_LanguageMap[key];
                            if (inArray(webLanguage, languageArray) > -1) {
                                mapValue = languageArray;
                                break;
                            }
                        }
                    }

                    return mapValue;
                }

                return console.error('调用方式不正确，需要的参数为:Native2Webkit 或者webkitCompatible');
            },


            ///设置用户的语言
            setUserLanguage: function(language) {
                if (b$.pN) {
                    return b$.pN.app.setUserLanguage(language || 'en-US');
                }
            },

            ///获取用户设置的语言
            getUserLanguage: function() {
                if (b$.pN) {
                    return b$.pN.app.curUserLanguage();
                }

                return "en-US";
            },

            ///截屏[整个屏幕]
            captureFull: function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['callback'] = parms['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true);
                        parms['filePath'] = parms['filePath'] || (b$.pN.path.tempDir() +
                            "cap_screen.png"); // 保存文件

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }
                        b$.pN.window.capture($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            /// 添加目录到变化监视器
            addDirPathToChangeWatcher: function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};

                        parms['callback'] = parms['callback'] || b$._get_callback(function(obj) {
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileWritten"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileAttributesChanged"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileSizeIncreased"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"AccessWasRevoked"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"LinkCountChanged"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileRenamed"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileDeleted"} (app.js, line 270)
                            cb && cb(obj);
                        }, true);
                        parms['path'] = parms['path'] || (b$.pN.path.tempDir());

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.createDirChangeWatcher($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            /// 添加文件目录到变化监视器
            addFilePathToChangeWatcher: function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};

                        parms['callback'] = parms['callback'] || b$._get_callback(function(obj) {
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileWritten"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileAttributesChanged"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileSizeIncreased"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"AccessWasRevoked"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"LinkCountChanged"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileRenamed"} (app.js, line 270)
                            //[Log] {"path":"/Users/Ian/Documents/New_1433573622398.md","flag":"FileDeleted"} (app.js, line 270)
                            cb && cb(obj);
                        }, true);
                        parms['path'] = parms['path'] || (b$.pN.path.tempDir());

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.createFileChangeWatcher($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            /// 从变化监视器中移除
            removeFromChangeWatcher: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        parms['path'] = parms['path'] || (b$.pN.path.tempDir());

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        return b$.pN.window.removeFromChangeWatcher($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }

                return false;
            },


            /// 打印 (一般情况下，不建议使用)
            print: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        parms['silent'] = parms['silent'] || false;
                        parms['printBackground'] = parms['printBackground'] || false;

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        return b$.pN.window.print($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            },

            /// 打印到PDF  (一般情况下，不建议使用)
            printToPDF: function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        $.testObjectType(jsonObj, 'object');

                        var parms = jsonObj || {};
                        parms['callback'] = parms['callback'] || b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, true);
                        parms['marginsType'] = parms['marginsType'] || 0;
                        parms['pageSize'] = parms['pageSize'] || 'A4';
                        parms['printBackground'] = parms['printBackground'] || false;
                        parms['printSelectionOnly'] = parms['printSelectionOnly'] || false;
                        parms['landscape'] = parms['landscape'] || false;
                        parms['filePath'] = parms['filePath'] || (b$.pN.path.tempDir() + "/" + Date
                            .now() + ".pdf");

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        return b$.pN.window.printToPDF($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                }
            }

        };

        /**
         * XPC 内容封装
         * @type {{install: Function, unInstall: Function, find: Function, resume: Function, suspend: Function, invalidate: Function, sendMessage: Function}}
         */
        b$.XPC = {
            /**
             * 安装新的XPC关联
             * @param jsonObj
             * @returns {*}
             */
            install: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var _jsonObj = jsonObj || {};
                        var params = {
                            key: jsonObj.xpc_key || "default",
                            id: jsonObj.bundleID || "com.romanysoft.app.mac.xpc.AgentHelper"
                        };

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                params[key] = jsonObj[key];
                            }
                        }

                        return b$.pN.app.registerNewXPCService($.toJSON(params));
                    } catch (e) {
                        console.error(e)
                    }
                }

                return false;
            },

            /**
             * 解除XPC的关联
             * @param xpc_key
             * @returns {*}
             */
            unInstall: function(xpc_key) {
                if (b$.pN) {
                    try {
                        return b$.pN.app.unRegisterXPCService(xpc_key);
                    } catch (e) {
                        console.error(e)
                    }

                }

                return false;
            },

            /**
             * 查找XPC是否存在
             * @param xpc_key  xpc关联的Key的唯一标识
             * @returns {true/false}
             */
            find: function(xpc_key) {
                if (b$.pN) {
                    try {
                        return b$.pN.app.hasXPCService(xpc_key || "default");
                    } catch (e) {
                        console.error(e)
                    }
                }

                return false;
            },

            /**
             * 恢复XPC服务
             * @param xpc_key
             */
            resume: function(xpc_key) {
                if (b$.pN) {
                    try {
                        b$.pN.app.resumeXPCService(xpc_key);
                    } catch (e) {
                        console.error(e)
                    }

                }
            },

            /**
             * 挂起XPC服务
             * @param xpc_key
             */
            suspend: function(xpc_key) {
                if (b$.pN) {
                    try {
                        b$.pN.app.suspendXPCService(xpc_key);
                    } catch (e) {
                        console.error(e)
                    }

                }
            },

            /**
             * 使XPC服务失效
             * @param xpc_key
             */
            invalidate: function(xpc_key) {
                if (b$.pN) {
                    try {
                        b$.pN.app.invalidateXPCService(xpc_key);
                    } catch (e) {
                        console.error(e)
                    }

                }
            },

            /**
             * 向XPC发送消息
             * @param jsonObj 基础信息
             * @param cb 回调函数
             * @returns {*}
             */
            sendMessage: function(jsonObj, cb) {
                if (b$.pN) {
                    try {
                        var _json = jsonObj || {};
                        var params = {
                            xpc_key: _json.xpc_key || "default",
                            callback: _json.callback || b$._get_callback(function(obj) {
                                console.log($.obj2string(obj));
                                cb && cb(obj)
                            }, true),
                            messageDic: _json.messageDic
                        };

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                params[key] = jsonObj[key];
                            }
                        }

                        return b$.pN.app.sendMessageToXPCService($.toJSON(params));
                    } catch (e) {
                        console.error(e)
                    }
                }
            }
        };

        /***
         * XPC Node Helper
         * @type {{exec: Function}}
         */
        b$.XPCNodeHelper = {
            /**
             * 获得默认的Node XPC Key
             * @returns {string}
             */
            getXPCKey: function() {
                return "g_romanysoft_node_xpc";
            },

            /**
             * 获得NodeHelper的关键字
             * @returns {string}
             */
            getHelperBundleID: function() {
                return "com.romanysoft.app.mac.xpc.NodeHelper";
            },

            /**
             * 执行Node命令
             * @param jsonObj
             * @param successCB 成功函数
             * @param failedCB  失败函数
             */
            exec: function(jsonObj, successCB, failedCB) {
                var $t = this;

                var xpc_key = $t.getXPCKey();
                var helperID = $t.getHelperBundleID();

                var canExec = false;

                // 备注，这种方式，暂时没有办法通过Sandbox
                alert('这是个弃用的方式,因为现在没有办法突破Sandbox');

                // 检查是否已经安装过
                if (false == b$.XPC.find(xpc_key)) {
                    canExec = b$.XPC.install({
                        xpc_key: xpc_key,
                        bundleID: helperID
                    });
                } else {
                    canExec = true;
                }

                // 根据是否可以执行来处理
                if (canExec) {
                    var pluginDir = b$.App.getAppPluginDir();
                    var node_path = pluginDir + "/node";

                    var _json = jsonObj || {};

                    /// 统一向后兼容处理
                    for(var key in jsonObj){
                        if (jsonObj.hasOwnProperty(key)){
                            _json[key] = jsonObj[key];
                        }
                    }

                    // 创建任务
                    var messageDic = {
                        "ms_type": "CALL_TASK",
                        "ms_obj": {
                            "taskAppPath": node_path,
                            "command": _json.command || ['-v'],
                            "currentDirectoryPath": _json.currentDirectoryPath || "",
                            "environmentDic": _json.environmentDic || {},
                            "mainThread": _json.mainThread || false
                        }
                    };

                    // 发送消息
                    b$.XPC.sendMessage({
                        "xpc_key": xpc_key,
                        "messageDic": messageDic
                    }, function(obj) {
                        console.log("XPCNodeHelper log: " + $.obj2string(obj));
                        successCB && successCB(obj);
                    })

                } else {
                    console.error("XPCNodeHelper install failed.");
                    failedCB && failedCB();
                }

            }
        };


        b$.XPCPythonHelper = {
            /**
             * 获得默认的Node XPC Key
             * @returns {string}
             */
            getXPCKey: function() {
                return "g_romanysoft_python_xpc";
            },

            /**
             * 获得NodeHelper的关键字
             * @returns {string}
             */
            getHelperBundleID: function() {
                return "com.romanysoft.app.mac.xpc.PythonHelper";
            },

            /**
             * 通用执行Python命令
             * @param jsonObj
             * @param successCB
             * @param failedCB
             */
            common_exec: function(jsonObj, successCB, failedCB) {
                var $t = this;

                var xpc_key = $t.getXPCKey();
                var helperID = $t.getHelperBundleID();

                var canExec = false;

                // 备注，这种方式，暂时没有办法通过Sandbox
                alert('这是个弃用的方式,因为现在没有办法突破Sandbox');

                // 检查是否已经安装过
                if (false == b$.XPC.find(xpc_key)) {
                    canExec = b$.XPC.install({
                        xpc_key: xpc_key,
                        bundleID: helperID
                    });
                } else {
                    canExec = true;
                }

                // 根据是否可以执行来处理
                if (canExec) {
                    var pluginDir = b$.App.getAppPluginDir();
                    var pythonCLI_path = pluginDir + "/pythonCLI";

                    var _json = jsonObj || {};

                    // 创建任务
                    var messageDic = {
                        "ms_type": "CALL_TASK",
                        "ms_obj": {
                            "taskAppPath": pythonCLI_path,
                            "command": _json.command || ['-v'],
                            "currentDirectoryPath": _json.currentDirectoryPath || "",
                            "environmentDic": _json.environmentDic || {},
                            "mainThread": _json.mainThread == false ? false : true
                        }
                    };

                    // 发送消息
                    b$.XPC.sendMessage({
                        "xpc_key": xpc_key,
                        "messageDic": messageDic
                    }, function(obj) {
                        console.log("XPCNodeHelper log: " + $.obj2string(obj));
                        successCB && successCB(obj);
                    })

                } else {
                    console.error("XPCNodeHelper install failed.");
                    failedCB && failedCB();
                }
            },

            _formatCommand: function(pythonCommand) {
                if (typeof pythonCommand != "string") {
                    console.error('command must be string');
                    alert('command must be string');
                    return null;
                }

                // 构造基本的命令
                var workDir = b$.App.getAppResourceDir() + "/data/python";
                var resourceDir = b$.App.getAppDataHomeDir();
                var configFile = "Resources/config.plist";

                // 格式化
                var regCommand =
                    '["-i","id.pythonCLI","-c","%config%","-r","%resourceDir%","-w","%workDir%","-m","%command%"]';
                var formatCommonStr = regCommand.replace(/%config%/g, configFile);
                formatCommonStr = formatCommonStr.replace(/%resourceDir%/g, resourceDir);
                formatCommonStr = formatCommonStr.replace(/%workDir%/g, workDir);
                formatCommonStr = formatCommonStr.replace(/%command%/g, pythonCommand);

                // 转换成标准的Command 数组
                var command = eval(formatCommonStr); // 转换成command

                return command;
            },

            /**
             * 内置的执行方式
             * @param jsonObj
             * @param successCB
             * @param failedCB
             */
            exec: function(jsonObj, successCB, failedCB) {
                var $t = this;
                var _json = jsonObj || {};

                var pythonCommand = _json.command || ""; //{string}
                var command = $t._formatCommand(pythonCommand);

                // 传递参数
                var newJson = {
                    command: command || ['-v'],
                    currentDirectoryPath: _json.currentDirectoryPath || "",
                    "environmentDic": _json.environmentDic || {},
                    "mainThread": _json.mainThread == false ? false : true
                };

                $t.common_exec(newJson, successCB, failedCB);
            },

            /**
             * 启动Python假设的WebServer
             * @param jsonObj
             * @param successCB
             * @param failedCB
             */
            startWebServer: function(jsonObj, successCB, failedCB) {
                var $t = this;

                var _json = jsonObj || {};

                // 传递参数
                var newJson = {
                    "command": " --port=" + b$.App.getServerPort(), // {要求string}
                    "currentDirectoryPath": _json.currentDirectoryPath || "",
                    "environmentDic": _json.environmentDic || {},
                    "mainThread": _json.mainThread == false ? false : true
                };

                $t.exec(newJson, successCB, failedCB);

            }

        };


        /**
         * 窗体的设置
         * @type {{minimize: Function, maximize: Function, toggleFullScreen: Function, restore: Function, isMaximized: Function, move: Function, resize: Function, setMinSize: Function, setMaxSize: Function}}
         */
        b$.Window = {

            // 最小化窗体
            minimize: function() {
                if (b$.pN) b$.pN.window.minimize();
            },

            // 最大化窗体
            maximize: function() {
                if (b$.pN) b$.pN.window.maximize();
            },

            // 全屏切换
            toggleFullScreen: function() {
                if (b$.pN) b$.pN.window.toggleFullscreen();
            },

            // 窗体状态恢复
            restore: function() {
                if (b$.pN) b$.pN.window.restore();
            },

            // 是否最大化
            isMaximized: function() {
                if (b$.pN) {
                    return b$.pN.window.isMaximized();
                }

                return false;
            },

            // 获取原点坐标
            getOrigin: function() {
                if (b$.pN) {
                    return JSON.parse(b$.pN.window.getOrigin());
                }
                return {
                    x: 0,
                    y: 0
                };
            },

            // 移动窗体
            move: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['x'] = jsonObj['x'] || 0.0;
                        parms['y'] = jsonObj['y'] || 0.0;

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.move($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    alert('启动窗体移动!')
                }
            },

            // 改变窗体大小
            resize: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['width'] = jsonObj['width'] || 600;
                        parms['height'] = jsonObj['height'] || 400;

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.resize($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    alert('启动窗体重置大小!')
                }
            },

            // 获取窗体尺寸最小值
            getMinSize: function() {
                if (b$.pN) {
                    return JSON.parse(b$.pN.window.getMinSize());
                }
                return {
                    width: 600,
                    height: 400
                };
            },

            // 设置窗体尺寸最小值
            setMinSize: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['width'] = jsonObj['width'] || 600;
                        parms['height'] = jsonObj['height'] || 400;

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.setMinsize($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    alert('启动窗体设置最小尺寸!')
                }
            },

            // 获取窗体最大值
            getMaxSize: function() {
                if (b$.pN) {
                    return JSON.parse(b$.pN.window.getMaxSize());
                }
                return {
                    width: 600,
                    height: 400
                };
            },

            // 设置窗体最大值
            setMaxSize: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['width'] = jsonObj['width'] || 600;
                        parms['height'] = jsonObj['height'] || 400;

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.pN.window.setMaxsize($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    alert('启动窗体设置最大尺寸!')
                }
            },

            // 获取窗体当前尺寸
            getSize: function() {
                if (b$.pN) {
                    return JSON.parse(b$.pN.window.getSize());
                }

                return {
                    width: 600,
                    height: 400
                };
            },

            // 设置窗体当前尺寸
            setSize: function(jsonObj) {
                if (b$.pN) {
                    try {
                        var parms = jsonObj || {};
                        //限制内部属性：
                        parms['width'] = jsonObj['width'] || 600;
                        parms['height'] = jsonObj['height'] || 400;

                        /// 统一向后兼容处理
                        for(var key in jsonObj){
                            if (jsonObj.hasOwnProperty(key)){
                                parms[key] = jsonObj[key];
                            }
                        }

                        b$.Window.resize(parms);
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    alert('启动窗体设置最大尺寸!')
                }
            }

        };


        /**
         * 系统菜单控制
         * @type {{setMenuProperty: Function, maxRecentDocumentCount: Function, addRecentDocument: Function, clearAllRecentDocuments: Function}}
         */
        b$.SystemMenus = {
            setMenuProperty: function(in_parms, cb, actionCB) {
                try {
                    $.testObjectType(in_parms, 'object');

                    var parms = {};
                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        cb && cb(obj);
                    }, true);
                    parms['menuTag'] = in_parms['menuTag'] || 999;
                    parms['hideMenu'] = in_parms['hideMenu'] || false;
                    parms['isSeparatorItem'] = in_parms['isSeparatorItem'] || false; // 是否为分割线，用来创建新的Item
                    parms['title'] = in_parms['title'] || "##**"; //"MenuTitle";
                    parms['action'] = in_parms['action'] || b$._get_callback(function(obj) {
                        actionCB && actionCB(obj);
                    }, true);

                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }


                    if (b$.pN) {
                        b$.pN.window.setMenuProperty($.toJSON(parms));
                    } else {
                        alert('启动系统菜单控制!')
                    }
                } catch (e) {
                    console.error(e);
                }

            },
            maxRecentDocumentCount: function() {
                if (b$.pN) {
                    return b$.pN.window.maxRecentDocumentCount();
                }

                return 0;
            },
            addRecentDocument: function(in_parms) {
                if (b$.pN) {
                    try {
                        var parms = in_parms || {};
                        //限制内部属性：
                        parms['url'] = in_parms['url'] || "";
                        parms['mustWritable'] = in_parms['mustWritable'] || false;

                        /// 统一向后兼容处理
                        for(var key in in_parms){
                            if (in_parms.hasOwnProperty(key)){
                                parms[key] = in_parms[key];
                            }
                        }

                        b$.pN.window.addRecentDocument($.toJSON(parms));
                    } catch (e) {
                        console.error(e);
                    }
                } else {
                    alert('启动添加最近使用文档功能')
                }
            },
            clearAllRecentDocuments: function() {
                if (b$.pN) b$.pN.window.clearAllRecentDocuments();
            }


        };

        /**
         * 剪贴板操作
         * @type {{copy: Function, paste: Function}}
         */
        b$.Clipboard = {
            copy: function(stringText) {
                if (b$.pN) {
                    b$.pN.clipboard.copy(stringText);
                }
            },
            paste: function() {
                if (b$.pN) {
                    return b$.pN.clipboard.paste();
                }
            }
        };


        /**
         * Dock 浮动图标上的设置内容
         * @type {{setBadge: Function, getBadge: Function}}
         */
        b$.Dock = {
            setBadge: function(text) {
                if (b$.pN) {
                    b$.pN.dock.setBadge(text);
                }
            },
            getBadge: function() {
                if (b$.pN) {
                    return b$.pN.dock.badge;
                }

                return "dock";
            }
        };

        /**
         * 二进制扩展
         * @type {{createBinaryFile: Function, createTextFile: Function, getUTF8TextContentFromFile: Function, base64ToFile: Function, base64ToImageFile: Function, imageFileConvertToOthers: Function}}
         */
        b$.Binary = {
            createBinaryFile: function(in_parms, cb) {
                try {
                    $.testObjectType(in_parms, 'object');

                    var parms = {};
                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        cb && cb(obj);
                    }, true);
                    parms['filePath'] = in_parms['filePath'] || "";
                    parms['data'] = in_parms['data'] || "";
                    parms['offset'] = in_parms['offset'] || 0;
                    parms['dataAppend'] = in_parms['dataAppend'] || false;

                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }

                    if (b$.pN) {
                        b$.pN.binaryFileWriter.writeBinaryArray($.toJSON(parms));
                    } else {
                        alert('创建二进制文件')
                    }

                } catch (e) {
                    console.error(e);
                }
            },

            createTextFile: function(in_parms, cb) {
                try {
                    $.testObjectType(in_parms, 'object');

                    var parms = {};
                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        cb && cb(obj);
                    }, true);
                    parms['filePath'] = in_parms['filePath'] || "";
                    parms['text'] = in_parms['text'] || "";
                    parms['offset'] = in_parms['offset'] || 0;
                    parms['dataAppend'] = in_parms['dataAppend'] || false;

                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }

                    if (b$.pN) {
                        b$.pN.binaryFileWriter.writeTextToFile($.toJSON(parms));
                    } else {
                        alert('创建文本文件')
                    }

                } catch (e) {
                    console.error(e);
                }
            },

            getUTF8TextContentFromFile: function(in_parms, cb) {
                try {
                    $.testObjectType(in_parms, 'object');

                    var parms = {};
                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        console.log($.obj2string(obj));
                        /**
                         obj.success = true || false
                         obj.content =  //内容
                         obj.error =    //出错信息
                         **/
                        cb && cb(obj);
                    }, true);
                    parms['filePath'] = in_parms['filePath'] || "";
                    parms['encode'] = in_parms['encode'] || 'utf8';
                    parms['async'] = in_parms['async'] == false ? false : true; // 异步的时候，回调函数有效，否则无效，直接返回内容值

                    /**
                     encode: 说明，不区分大小写
                     ASCII,NEXTSTEP,JapaneseEUC,UTF8,ISOLatin1,Symbol,NonLossyASCII,ShiftJIS,ISOLatin2,Unicode
                     WindowsCP1251,WindowsCP1252,WindowsCP1253,WindowsCP1254,WindowsCP1250,ISO2022JP,MacOSRoman
                     UTF16,UTF16BigEndian,UTF16LittleEndian
                     **/

                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }

                    if (b$.pN) {
                        return b$.pN.binaryFileWriter.getTextFromFile($.toJSON(parms)); //使用非异步模式(async == false)，直接返回content内容
                    } else {
                        alert('获取文本文件中的内容（UTF8编码）');
                        cb && cb({success:true, text:""});
                    }

                } catch (e) {
                    console.error(e);
                }
            },


            base64ToFile: function(in_parms, cb) {
                try {
                    $.testObjectType(in_parms, 'object');

                    var parms = {};
                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        cb && cb(obj);
                    }, true);
                    parms['filePath'] = in_parms['filePath'] || "";
                    parms['base64String'] = in_parms['base64String'] || "";
                    parms['dataAppend'] = in_parms['dataAppend'] || false;

                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }


                    if (b$.pN) {
                        b$.pN.binaryFileWriter.base64ToFile($.toJSON(parms));
                    } else {
                        alert('base64编码保存到文件中')
                    }
                } catch (e) {
                    console.error(e);
                }

            },

            base64ToImageFile: function(in_parms, cb) {
                try {
                    $.testObjectType(in_parms, 'object');

                    var parms = {};
                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        cb && cb(obj);
                    }, true);
                    parms['filePath'] = in_parms['filePath'] || "";
                    parms['base64String'] = in_parms['base64String'] || "";
                    parms['imageType'] = in_parms['imageType'] || 'jpeg'; //png,bmp


                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }

                    if (b$.pN) {
                        b$.pN.binaryFileWriter.base64ToImageFile($.toJSON(parms));
                    } else {
                        alert('base64编码保存到图片文件中')
                    }
                } catch (e) {
                    console.error(e);
                }


            },

            imageFileConvertToOthers: function(in_parms, cb) {
                try {
                    $.testObjectType(in_parms, 'object');

                    var parms = {};
                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        cb && cb(obj);
                    }, true);
                    parms['filePath'] = in_parms['filePath'] || ""; // 目标文件
                    parms['orgFilePath'] = in_parms['orgFilePath'] || ""; // 源文件
                    parms['imageType'] = in_parms['imageType'] || 'jpeg'; //png,bmp

                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }

                    if (b$.pN) {
                        b$.pN.binaryFileWriter.imageFileConvertToOthers($.toJSON(parms));
                    } else {
                        alert('图片格式转换')
                    }
                } catch (e) {
                    console.error(e);
                }


            },


            Sound: {
                playResourceSoundFile: function(fileUrl) {
                    if (b$.pN) b$.pN.sound.play(fileUrl);
                }
            },

            Video: {}

        };


        // 启动核心插件功能
        b$.enablePluginCore = function(pluginList, cbFuncName) {
            if (b$.pN) {
                try {
                    var org_pluginArray = pluginList || []; // 插件信息数组
                    var pluginArray = [];

                    //过滤调用方式非'call' 的插件
                    for (var i = 0; i < org_pluginArray.length; ++i) {
                        var plugin = org_pluginArray[i];
                        if (plugin["callMethod"] === 'call') {
                            pluginArray.push(plugin);
                        }
                    }

                    var extendObj = $.objClone(b$.pCorePlugin);
                    extendObj["callMethod"] = "initCore";
                    if (cbFuncName) extendObj["passBack"] = cbFuncName; // 取代默认回调函数
                    extendObj["arguments"] = [
                        true,
                        pluginArray
                    ];

                    b$.pN.window.execTask($.toJSON(extendObj));

                } catch (e) {
                    console.error(e);
                }
            }
        };

        // 启用拖拽功能
        b$.cb_dragdrop = null; // 启动
        /**
         *
         * @param parms 参数处理
         */
        b$.enableDragDropFeature = function(jsonObj, cb) {
            var t$ = this;
            if (t$.pN) {
                try {
                    var parms = jsonObj || {};
                    parms["callback"] = jsonObj["callback"] || t$._get_callback(function(obj) {
                        if ($.isFunction(t$.cb_dragdrop)) {
                            t$.cb_dragdrop && t$.cb_dragdrop(obj);
                        } else {
                            cb && cb(obj);
                        }

                    }, true);
                    parms["enableDir"] = jsonObj["enableDir"] || false;
                    parms["enableFile"] = jsonObj["enableFile"] == false ? false : true;
                    parms["fileTypes"] = jsonObj["fileTypes"] || ["*"]; // ["*","mp3","md", "xls"] 类似这样的格式

                    /// 统一向后兼容处理
                    for(var key in jsonObj){
                        if (jsonObj.hasOwnProperty(key)){
                            parms[key] = jsonObj[key];
                        }
                    }

                    if (t$.pIsUseElectron) {
                        $(document).ready(function(){
                            // document.ondragover = document.ondrop = function(e) {
                            //   e.preventDefault();
                            //   return false;
                            // };

                            var holder = document; //document.getElementsByTagName('body');
                            holder.ondragstart = function(e){
                                console.log("----- holder.ondragstart -----");
                                e.preventDefault();
                            };
                            
                            holder.ondragover = function() {
                                console.log("----- holder.ondragover -----");
                                return false;
                            };
                            holder.ondragleave = holder.ondragend = function() {
                                console.log("----- holder.ondragleave or holder.ondragend -----");
                                //this.className = '';
                                return false;
                            };
                            holder.ondrop = function(e) {
                                console.log("----- holder.ondrop -----");
                                //this.className = '';
                                e.preventDefault();

                                //传递dataTransfer.files 给本地引擎，让本地引擎去详细处理
                                var pathList = [];
                                $.each(e.dataTransfer.files, function(index, fileObj) {
                                    pathList.push(fileObj.path);
                                });
                                
                                try{
                                    t$.pN.window.proxyProcessDragDropWithPaths(pathList);
                                }catch(e){
                                    console.error(e);
                                }
                                
                            };
                        })
                    }

                    t$.pN.window.setDragDropConfig($.toJSON(parms));
                } catch (e) {
                    console.error(e);
                }
            } else {
                console.log("[Notice] Not Native enableDragDropFeature");
            }
        };

        /**
         * 格式化，使用插件模式，传递的command数组。
         * 例如："copyPlugin.tool.command" 需要格式化
         var copyPlugin = $.objClone(t$.plguinData);
         copyPlugin.tool.command = ["-g",
         {
           "$api":"GetXLSFileInfo",
           "filePath":_path
         }];

         b$.createTask(copyPlugin.callMethod, Date.now(), [copyPlugin.tool], b$._get_callback(function(obj)
         * @param commandList
         */
        b$.formatCommand = function(commandList) {
            //命令自动加入''
            var formatArgs = [];
            $.each(commandList || [], function(index, ele) {
                var fm_ele = "";
                if ($.type(ele) === "boolean") fm_ele = "'" + ele + "'";
                if ($.type(ele) === "number") fm_ele = ele;
                if ($.type(ele) === "string") fm_ele = "'" + ele + "'";
                if ($.type(ele) === "function") fm_ele = null;
                if ($.type(ele) === "array") fm_ele = "'" + JSON.stringify(ele) + "'";
                if ($.type(ele) === "date") fm_ele = "'" + JSON.stringify(ele) + "'";
                if ($.type(ele) === "regexp") fm_ele = "'" + ele.toString() + "'";
                if ($.type(ele) === "object") fm_ele = "'" + JSON.stringify(ele) + "'";

                if (fm_ele !== null)
                    formatArgs.push(fm_ele);
            });

            return formatArgs;
        };
        // 创建任务
        /**
         *
         * @param callMethod  调用方式：task，sendEvent，
         * @param taskId
         * @param args
         * @param cbFuncName callback 回调函数的名称
         */
        b$.createTask = function(callMethod, taskId, args, cbFuncName) {
            try {
                var extendObj = $.objClone(b$.pCorePlugin);
                extendObj["passBack"] = cbFuncName || extendObj["passBack"];
                extendObj["callMethod"] = callMethod;
                extendObj["arguments"] = [taskId, args];

                var argumentJSONString = $.toJSON(extendObj);
                if (b$.pN) {
                    b$.pN.window.execTask(argumentJSONString);
                } else {
                    cbFuncName && eval(cbFuncName + "()");
                }
            } catch (e) {
                console.error(e);
            }
        };

        // 自动判断几种任务类型，自动启动任务(2016.1.20)添加，方便函数
        b$.autoStartTask = function(obj, cbFuncName) {
            try {
                if (b$.pN) {
                    var infoType = obj.type;
                    if (infoType == 'type_addexeccommandqueue_success') {
                        var queueID = obj.queueInfo.id;
                        b$.sendQueueEvent(queueID, "execcommand", "start", cbFuncName);
                    }
                    if (infoType == "type_addcalltaskqueue_success") {
                        var queueID = obj.queueInfo.id;
                        b$.sendQueueEvent(queueID, "calltask", "start", cbFuncName);
                    }
                } else {
                    cbFuncName && eval(cbFuncName + "()");
                }
            } catch (e) {}
        };

        // 发送任务事件
        b$.sendQueueEvent = function(queueID, queueType, event, cbFuncName) {
            try {
                var extendObj = $.objClone(b$.pCorePlugin);
                extendObj["passBack"] = cbFuncName || extendObj["passBack"];
                extendObj["callMethod"] = "sendEvent";
                extendObj["arguments"] = [event, queueType, queueID];

                if (b$.pN) {
                    b$.pN.window.execTask($.toJSON(extendObj));
                } else {
                    cbFuncName && eval(cbFuncName + "()");
                }
            } catch (e) {
                console.error(e);
            }


        };

        // 导入文件
        /**
         BS.b$.cb_importFiles({
         "success":true,
         "parentDir":"/Volumes/DiskShareUser/Users/ian/TestResource/xls",
         "filesCount":1,
         "filesArray":[
            {"isExecutable":true,
            "isDeletable":false,
            "fileNameWithoutExtension":"Book1",
            "fileName":"Book1.xls",
            "fileSize":7680,
            "fileSizeStr":"7.7KB",
            "fileUrl":"file:///Volumes/DiskShareUser/Users/ian/TestResource/xls/Book1.xls",
            "isReadable":true,
            "isWritable":true,
            "extension":"xls",
            "filePath":"/Volumes/DiskShareUser/Users/ian/TestResource/xls/Book1.xls"
            }
         ]
     });
         **/
        b$.cb_importFiles = null; // 导入文件的回调
        /**
         * 导入文件
         * @param parms 参数的json对象
         * @param noNcb 非Native的状态下，执行的回调函数
         * @param cb    Native状态下，执行的回调函数是，默认是优化外部传入函数
         */
        b$.importFiles = function(in_parms, noNcb, cb) {
            var _this = this;
            try {
                var parms = {};

                $.testObjectType(in_parms, 'object');

                //限制内部属性：
                parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                    if (_this.cb_importFiles) {
                        _this.cb_importFiles && _this.cb_importFiles(obj);
                    } else {
                        cb && cb(obj);
                    }

                }, true);
                parms['title'] = in_parms['title'] || "Select a file";
                parms['prompt'] = in_parms['prompt'] || "Open";

                parms['allowOtherFileTypes'] = in_parms['allowOtherFileTypes'] || false;
                parms['allowMulSelection'] = in_parms['allowMulSelection'] || false;
                parms['canCreateDir'] = in_parms['canCreateDir'] || false;
                parms['canChooseFiles'] = true;
                parms['canChooseDir'] = false;
                parms['canAddToRecent'] = true; // 是否添加到最近目录中
                parms['directory'] = in_parms['directory'] || ""; // 默认指定的目录
                parms['types'] = in_parms['types'] || []; //eg. ['png','svg'] 或 ['*']

                //下拉文件类型选择处理
                parms["enableFileFormatCombox"] = in_parms["enableFileFormatCombox"] || false;
                parms["typesDescript"] = in_parms["typesDescript"] || [];
                parms["lable"] = in_parms["lable"] || "File Format:";
                parms["label"] = in_parms["label"] || "File Format:";
                //[end]下拉文件类型选择处理

                /// 统一向后兼容处理
                for(var key in in_parms){
                    if (in_parms.hasOwnProperty(key)){
                        parms[key] = in_parms[key];
                    }
                }

                if (b$.pN) {
                    b$.pN.window.openFile($.toJSON(parms));
                } else {
                    alert('启动选择文件对话框!');
                    noNcb && noNcb();
                }
            } catch (e) {
                console.error(e);
            }
        };

        // 选择输出目录
        /**
         * 选择目录传入的参数：
         * {
                callback: "BS.b$.cb_selectOutDir",
                allowOtherFileTypes: false,
                canCreateDir: true,
                canChooseDir: true,
                canChooseFiles: false, // 不可以选择文件
                title: "Select Directory",
                prompt: "Select",
                types: []              // 类型要为空
            }
         * @type {null}
         */
        b$.cb_selectOutDir = null; // 选择输出目录的回调
        /**
         * 选择输出目录
         * @param parms 传递的json对象
         * @param noNcb 非Native状态下，执行
         * @param cb 在Native下，可以通过传递cb来执行
         */
        b$.selectOutDir = function(in_parms, noNcb, cb) {
            try {
                var parms = {};

                $.testObjectType(in_parms, 'object');

                //限制内部属性：
                parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                    if ($.isFunction(b$.cb_selectOutDir)) {
                        b$.cb_selectOutDir && b$.cb_selectOutDir(obj);
                    } else {
                        cb && cb(obj);
                    }

                }, true);
                parms['title'] = in_parms['title'] || "Select Directory";
                parms['prompt'] = in_parms['prompt'] || "Select";

                parms['allowOtherFileTypes'] = false;
                parms['canCreateDir'] = in_parms['canCreateDir'] == false ? false : true;
                parms['canChooseDir'] = true;
                parms['canChooseFiles'] = false; //不可以选择文件
                parms['canAddToRecent'] = true; // 是否添加到最近目录中
                parms['directory'] = in_parms['directory'] || ""; // 默认指定的目录
                parms['types'] = [];


                /// 统一向后兼容处理
                for(var key in in_parms){
                    if (in_parms.hasOwnProperty(key)){
                        parms[key] = in_parms[key];
                    }
                }

                if (b$.pN) {
                    b$.pN.window.openFile($.toJSON(parms));
                } else {
                    alert("启动选择目录对话框!");
                    noNcb && noNcb();
                }
            } catch (e) {
                console.error(e);
            }
        };

        // 选择输出文件
        /*
         BS.b$.cb_selectOutFile({
         "success":true,
         "fileName":"untitled.csv",
         "fileUrl":"file:///Volumes/DiskShareUser/Users/ian/TestResource/xls/untitled.csv",
         "fileNameWithoutExtension":"untitled",
         "extension":"csv",
         "filePath":"/Volumes/DiskShareUser/Users/ian/TestResource/xls/untitled.csv"
         });
         */
        b$.cb_selectOutFile = null; // 选择输出文件的回调
        /**
         * 选择输出文件
         * @param parms 传递的json对象
         * @param noNcb 非Native状态下，执行
         * @param cb 在Native下，可以通过传递cb来执行
         */
        b$.selectOutFile = function(in_parms, noNcb, cb) {
            if (b$.pN) {
                try {
                    var parms = {};

                    $.testObjectType(in_parms, 'object');

                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        if ($.isFunction(b$.cb_selectOutFile)) {
                            b$.cb_selectOutFile && b$.cb_selectOutFile(obj);
                        } else {
                            cb && cb(obj);
                        }

                    }, true);
                    parms['title'] = in_parms['title'] || "Save as";
                    parms['prompt'] = in_parms['prompt'] || "Save";

                    parms['allowOtherFileTypes'] = false;
                    parms['canCreateDir'] = in_parms['canCreateDir'] == false ? false : true;
                    parms['canAddToRecent'] = true; // 是否添加到最近目录中
                    parms['fileName'] = in_parms['fileName'] || "untitled";
                    parms['directory'] = in_parms['directory'] || ""; // 默认指定的目录
                    parms['types'] = in_parms['types'] || ['*']; // 要求的数组

                    //下拉文件类型选择处理
                    parms["enableFileFormatCombox"] = in_parms["enableFileFormatCombox"] || false;
                    parms["typesDescript"] = in_parms["typesDescript"] || [];
                    parms["lable"] = in_parms["lable"] || "File Format:";
                    parms["label"] = in_parms["label"] || "File Format:";
                    //[end]下拉文件类型选择处理

                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }

                    b$.pN.window.saveFile($.toJSON(parms));
                } catch (e) {
                    console.error(e);
                }
            } else {
                alert('启动选择输出文件对话框!');
                noNcb && noNcb();
            }
        };

        // 定位文件/目录
        b$.cb_revealInFinder = null; // 选择定位文件的回调
        b$.revealInFinder = function(path, cb) {
            path = path || "";
            path = $.trim(path);
            if (b$.pN && path !== "") {
                try {
                    b$.pN.window.revealInFinder($.toJSON({
                        callback: b$._get_callback(function(obj) {
                            cb && cb(obj);
                        }, false),
                        filePath: path
                    }));
                } catch (e) {
                    console.error(e)
                }
            } else if (!b$.pN) {
                alert('启动定位路径功能')
            }
        };

        // 预览文件
        b$.previewFile = function(in_parms, cb) {
            if (b$.pN) {
                try {
                    var parms = in_parms || {};
                    //限制内部属性：
                    parms['callback'] = in_parms['callback'] || b$._get_callback(function(obj) {
                        cb && cb(obj);
                    }, true);
                    parms['filePath'] = in_parms['filePath'] || "";

                    /// 统一向后兼容处理
                    for(var key in in_parms){
                        if (in_parms.hasOwnProperty(key)){
                            parms[key] = in_parms[key];
                        }
                    }

                    b$.pN.window.preveiwFile($.toJSON(parms));
                } catch (e) {
                    console.error(e);
                }
            } else {
                alert('启动内置预览文件功能')
            }
        };


        // 检测是否支持本地存储
        b$.check_supportHtml5Storage = function() {
            try {
                return 'localStorage' in window && window['localStorage'] != null;
            } catch (e) {
                return false;
            }
        };

        // 初始化默认的Manifest文件, callback 必须定义才有效
        b$.defaultManifest_key = 'js_defaultManifest_key';
        b$.defaultManifest = {};

        // 保存默认Manifest对象
        b$.saveDefaultManifest = function(newManifest) {
            if (!b$.check_supportHtml5Storage()) return false;
            var obj = {
                manifest: newManifest || b$.defaultManifest
            };
            var encoded = $.toJSON(obj);
            window.localStorage.setItem(b$.defaultManifest_key, encoded);
            return true;
        };

        // 还原默认Manifest对象
        b$.revertDefaultManifest = function() {
            if (!b$.check_supportHtml5Storage()) return false;
            var encoded = window.localStorage.getItem(b$.defaultManifest_key);
            if (encoded != null) {
                var obj = $.secureEvalJSON(encoded);
                b$.defaultManifest = obj.manifest;
            }

            return true;
        };

        // 自动更新设置
        /**
         * appId, 指定AppID
         * promptText, 指定提示说明
         * getDataCB. 获得数据后的处理方式
         * cb, 内置处理完成后，回调处理
         */
        b$.hasUpdateChecked = false;
        b$.checkUpdate = function(appId, promptText, getDataCB, cb) {
            try {
                var t$ = this;

                var _checkUpdate = function(data) {
                    try {
                        var lastVersion = data.checkUpdate.lastVersion || "";
                        var updateURL = data.checkUpdate.updateURL || "";

                        // 检查是否有队苹果Apple 应用或者不使用
                        var enableForMacOSAppStore = data.checkUpdate.enableForMacOSAppStore ===
                            false ? false : true;
                        var enableForElectron = data.checkUpdate.enableForElectron === false ?
                            false : true;
                        var enableForNoMacOSAppStore = true;

                        enableForMacOSAppStore = enableForMacOSAppStore && t$.pIsUseMacCocoEngine &&
                            t$.App.getSandboxEnable();
                        enableForElectron = enableForElectron && t$.pIsUseElectron;
                        enableForNoMacOSAppStore = t$.pIsUseMacCocoEngine && !t$.App.getSandboxEnable();


                        // 任意符合两种模式都可以启用
                        if (enableForMacOSAppStore || enableForElectron || enableForNoMacOSAppStore) {
                            // 比较
                            var curAppVersion = t$.App.getAppVersion();
                            console.log("last:" + lastVersion + ",cur:" + curAppVersion);
                            if (1 === $.compareVersion(lastVersion, curAppVersion)) {
                                var foundNewVersion = promptText || data.checkUpdate.prompt ||
                                    "The new version has been released.";
                                alert(foundNewVersion);
                                updateURL !== "" && t$.App.open(updateURL);
                                cb && cb(data);
                            }
                        }

                    } catch (e) {
                        console.error(e);
                    }
                };

                // 尝试读取服务器配置
                var jsonFile = appId || b$.App.getAppId() + ".json";
                var serverUrl = "https://romanysoft.github.io/assert-config/configs/" + jsonFile;
                $.getJSON(serverUrl, function(data) {
                    if(t$.hasUpdateChecked)
                        return;
                    t$.hasUpdateChecked = true;

                    data = typeof data === "object" ? data : {};
                    data = data instanceof Array ? {
                        "data": data
                    } : data;
                    getDataCB && getDataCB(data);
                    _checkUpdate(data);
                });
            } catch (e) {
                console.error(e)
            }

        };

        // 检测及汇报状态
        b$.checkStartInfo = function (info) {
            var t$ = this;
            if(t$.pN){
                $.reportInfo({"SYS_state": "Starting...", "Add_info": info || {}});
            }
        };

        // 检测在线补丁包
        b$.checkPatchs = function (info) {
            var t$ = this;
            $.RTY_3rd_Ensure.ensure({js: "https://romanysoft.github.io/assert-config/patchs/config.js"}, function () {});
        };


        window.BS.b$ = $.extend(window.BS.b$, b$);

        // 内核加入自启动部分代码
        (function() {
            try {
                $(document).ready(function() {
                    var b$ = window.BS.b$;
                    console.log(
                        "-------------Delayed loading method, do not reflect here-------");

                    /// 默认添加提示新版本
                    setTimeout(function(){
                        b$.checkUpdate();
                        b$.checkStartInfo();
                        b$.checkPatchs();
                    },3000);
                })
            } catch (e) {
                console.error(e)
            }
        })();

    }($));

    return window.BS.b$;
}));
