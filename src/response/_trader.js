"use strict";

require('../libs.js');

let traders = {};

function getPath(id, sessionID) {
    let path = filepaths.user.profiles.traders[id];
    return path.replace("__REPLACEME__", sessionID);
}

function set(data, sessionID) {
    traders[data._id] = data;
    return json.write(getPath(data._id, sessionID), data);
}

function get(id, sessionID) {
    if (typeof traders[id] === "undefined") {
        traders[id] = json.parse(json.read(getPath(id, sessionID)));
    }

	return {err: 0, errmsg: "", data: traders[id]};
}

function getAll(sessionID) {
    let traders = [];

    // load trader files
    for (let file in filepaths.traders) {
        if (file !== "ragfair") {
            traders.push((get(file, sessionID)).data);
        }
    }

	return {err: 0, errmsg: null, data: traders};
}

function lvlUp(id, sessionID) {
    let pmcData = profile_f.getPmcData(sessionID);
    let currentTrader = get(id, sessionID);
    let loyaltyLevels = currentTrader.data.loyalty.loyaltyLevels;

    // level up player
    let checkedExp = 0;

    for (let level in globalSettings.data.config.exp.level.exp_table) {
        if (pmcData.Info.Experience < checkedExp) {
            break;
        }

        pmcData.Info.Level = level;
        checkedExp += globalSettings.data.config.exp.level.exp_table[level].exp;
    }

    // level up traders
    let targetLevel = 0;
    
    for (let level in loyaltyLevels) {
        // level reached
        if ((loyaltyLevels[level].minLevel <= pmcData.Info.Level
        && loyaltyLevels[level].minSalesSum <= currentTrader.data.loyalty.currentSalesSum
        && loyaltyLevels[level].minStanding <= currentTrader.data.loyalty.currentStanding)
        && targetLevel < 4) {
            targetLevel++;
            continue;
        }

        break;
    }

    currentTrader.data.loyalty.currentLevel = targetLevel;
    set(currentTrader.data, sessionID);

    // set assort
    assort_f.generate(id, sessionID);
}

module.exports.getPath = getPath;
module.exports.set = set;
module.exports.get = get;
module.exports.getAll = getAll;
module.exports.lvlUp = lvlUp;