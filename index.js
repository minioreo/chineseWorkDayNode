'use strict';

let holidayCache = {};
let moment = require("moment");


module.exports.initializer = async function(context, callback) {
  console.info("begin to initialize");
  await initHolidayDataListener();
  console.info("initialize finished");
  callback(null, '');
};

module.exports.handler = function(event, context, callback) {
  try{
    console.info("event is " , event.toString());
    let eventObj = JSON.parse(event.toString());
    let bodyString = "";
    if(eventObj.body!==null&&eventObj.body!==undefined){
      if(eventObj.isBase64Encoded!==null&&eventObj.isBase64Encoded!==undefined&&eventObj.isBase64Encoded){
        bodyString=new Buffer(eventObj.body,'base64').toString();
      }
      else{
        bodyString = eventObj.body;
      }
    }
    console.info("bodyString is ",bodyString);
    
    let body = JSON.parse(bodyString);
    let dateString = body["dateString"];
    let dayInfo = getDayInfo(dateString);
    let responseBody = {
      "isSuccess":true,
      "data":dayInfo
    }
    let responseBodyString = JSON.stringify(responseBody);

    let response = {
      "isBase64Encoded":false,
      "statusCode": 200,
      "body": responseBodyString
  };

    callback(null, response);
  }catch(e){
    console.error("execute fail",e)
    let responseBody = {
      "isSuccess":false,
      "errorCode":"Service_Error",
      "errorMessage":"Some unexpected error happened"
    }
    let responseBodyString = JSON.stringify(responseBody);
    let response = {
      "isBase64Encoded":false,
      "statusCode": 200,
      "body": responseBodyString
    };
    callback(null, response);
  }
}

function getDayInfo(dateString) {
  let dateKey = moment(dateString, "YYYY/MM/DD").format("YYYY-MM-DD");
  console.debug("cache is :", JSON.stringify(holidayCache));
  let cacheItem = holidayCache[dateKey];
  console.info("cacheItem:", cacheItem);
  if(cacheItem != null){
    return{
      isHoliday:cacheItem.isHoliday,
      relatedHolidayName:cacheItem.relatedHolidayName
    }
  }
  else{
    console.info("not in holiday data,go to weekend logic");
    let day = moment(dateString, "YYYY/MM/DD").day();
    console.info("moment get day is",day);
    return{
      isHoliday:(day == 0 || day == 6)
    }
  }
}

async function initHolidayDataListener() {
  try{
    const ACMClient = require('acm-client').ACMClient;
    const co = require('co');
    const acmEndPoint = process.env["acm_endpoint"];
    const acmNameSpace = process.env["acm_namespace"];
    const acmAccessKey = process.env["acm_accessKey"];
    const acmSecretKey = process.env["acm_secretKey"];
    const acmTimeout = process.env["acm_timeout"];
    const acmHolidayDataId = process.env["acm_holiday_dataId"];
    const acmHolidayGroup = process.env["acm_holiday_group"];

    const acm = new ACMClient({
      endpoint: acmEndPoint, // Available in the ACM console
      namespace: acmNameSpace, // Available in the ACM console
      accessKey: acmAccessKey, // Available in the ACM console
      secretKey: acmSecretKey, // Available in the ACM console
      requestTimeout: acmTimeout // Request timeout, 6s by default
    });
    console.info("begin to wait for client ready");
    await acm.ready();

    console.info("register error handler");
    acm.on('error', err => {
        console.error("acm error:" , err);
      });
    console.info("begin to get config");
    const content = await acm.getConfig(acmHolidayDataId, acmHolidayGroup);
    console.info('getConfig = ', content);
    rebuildHolidayCache(content);
    acm.subscribe({
      dataId: acmHolidayDataId,
      group: acmHolidayGroup
    }, content => {
      console.info("changeEvent,new config is " , content);
      rebuildHolidayCache(content);
    });
  }catch(e){
    console.error();("fail to init acm config" , e);
  }

  function rebuildHolidayCache(content){
    let holidayData = JSON.parse(content);
    holidayCache = {};
    for(let k in holidayData){
      let group = holidayData[k];
      for(let holidayName in group){
        let holidayItem = group[holidayName];

        let holidayList = holidayItem["holidays"];
        for(let i=0;i<holidayList.length;i++){
          let date = holidayList[i];
          let cacheItem = {
            "isHoliday":true,
            "relatedHolidayName":holidayName
          };
          holidayCache[date] = cacheItem;
        }

        let workdayList = holidayItem["workdays"];
        for(let i=0;i<workdayList.length;i++){
          let date = workdayList[i];
          let cacheItem = {
            "isHoliday":false,
            "relatedHolidayName":holidayName
          };
          holidayCache[date] = cacheItem;
        }
      }
    }
  }
}
