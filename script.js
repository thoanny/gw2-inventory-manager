Handlebars.registerHelper("currency", function(options) {
    let money = parseInt(options.fn(this));

    let copper = money % 100;
    let silver = Math.floor( (money % 10000) / 100 );
    let gold = Math.floor(money / 10000);

    let currency;

    if(gold) {
        currency = "<span class='gold'>"+gold+"</span><span class='silver'>"+silver.toString().padStart(2, '0')+"</span><span class='copper'>"+copper.toString().padStart(2, '0')+"</span>";
    } else if(silver) {
        currency = "<span class='silver'>"+silver+"</span><span class='copper'>"+copper.toString().padStart(2, '0')+"</span>";
    } else {
        currency = "<span class='copper'>"+copper+"</span>";
    }

    return new Handlebars.SafeString('<span class="currency">' + currency + "</span>");
});

Handlebars.registerHelper('gt', function(a, b) {
    return (a > b);
});

Handlebars.registerHelper('assign', function (varName, varValue, options) {
    if (!options.data.root) {
        options.data.root = {};
    }
    options.data.root[varName] = varValue;
});

const chunkSize = 150;

let apiKey;
let Gw2ApiUrl = 'https://api.guildwars2.com/v2';

let log = document.querySelector('#log');

let data = {
    'characters': {},
    'bank': [],
    'materials': [],
    'itemsMax': {},
    'itemsId': [],
    'itemsChunks': [],
    'itemsData': {},
    'itemsStorage': {}
};

let accountData = localStorage.getItem('accountData');

let characters = [];

function template(name, data, target, append = false) {
    let hb = Handlebars.compile(document.querySelector(name).innerHTML);
    if(append) {
        document.querySelector(target).innerHTML += hb(data);
    } else {
        document.querySelector(target).innerHTML = hb(data);
    }
}

function successCallback() {
    return true;
}

function logCallback(text) {
    log.classList.remove('text-red-500');
    log.classList.add('text-green-500');
    log.innerHTML = text;
}

function arrayChunk(arr, chunkSize) {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        res.push(chunk);
    }
    return res;
}

function setItem(id, qt, type, character = null) {
    if(data.itemsId.indexOf(id) >= 0) {
        data.itemsMax[id] += qt;
    } else {
        data.itemsId.push(id);
        data.itemsMax[id] = qt;
    }

    if(typeof data.itemsStorage[id] === 'undefined') {
        data.itemsStorage[id] = {
            'bank': 0,
            'materials': 0,
            'inventory': {}
        }
    }

    if(character) {
        if(typeof data.itemsStorage[id][type][character] === 'undefined') {
            data.itemsStorage[id][type][character] = qt;
        } else {
            data.itemsStorage[id][type][character] = data.itemsStorage[id][type][character] + qt;
        }

    } else {
        data.itemsStorage[id][type] = data.itemsStorage[id][type] + qt;
    }
}

function checkGW2ApiKeyPermissions() {
    return new Promise((successCallback) => {
        logCallback('Vérification de la clé API...');
        fetch(`${Gw2ApiUrl}/tokeninfo?access_token=${GW2ApiKeyIpt.value}`)
            .then((res) => {

                if(!res.ok) {
                    if (res.status === 401 ){
                        return Promise.reject('Clé API Guild Wars 2 invalide...');
                    } else {
                        return Promise.reject(`Erreur ${res.status}`);
                    }
                }
                return res.json();
            })
            .then((data) => {
                if(
                    data.permissions.indexOf('account') >= 0 &&
                    data.permissions.indexOf('inventories') >= 0 &&
                    data.permissions.indexOf('characters') >= 0
                ) {
                    localStorage.setItem('GW2ApiKey', GW2ApiKeyIpt.value);
                    apiKey = GW2ApiKeyIpt.value;
                    successCallback();
                } else {
                    return Promise.reject('Autorisations requises&nbsp;: account, inventories et characters.');
                }
            });
    });
}

function getCharacters() {
    return new Promise((successCallback) => {
        fetch(`${Gw2ApiUrl}/characters?access_token=${apiKey}`).then(res => {
            if(!res.ok) {
                return Promise.reject('Impossible de charger les personnages...');
            }
            return res.json();
        }).then(chars => {
            chars.forEach(c => {
                characters.push(c)
            });
            successCallback();
        });
    });
}

function getInventories() {
    let charactersList = {};

    characters.forEach(character => {
        charactersList[character] = `${Gw2ApiUrl}/characters/${character}/inventory?access_token=${apiKey}`;
    });

    let promises = Object.entries(charactersList).map(c => {
        return fetch(c[1]).then(function(res) {
            if(!res.ok) {
                return Promise.reject(`Impossible de charger ${c[0]}...`);
            }
            return res.json();
        }).then(inventory => {
            logCallback(`Chargement de l\'inventaire de ${c[0]}...`);
            inventory.bags.forEach(bag => {
                if(bag) {
                    bag.inventory.forEach(i => {
                        if(i) {
                            setItem(i.id, i.count, 'inventory', c[0]);
                        }
                    });
                }
            });
            data.characters[c[0]] = inventory;
        });
    });

    return Promise.all(promises).then(() => {
        successCallback();
    }).catch(() => {
        return Promise.reject('Impossible de charger les inventaires des personnages...');
    });

}

function getBank() {
    return new Promise(successCallback => {
        logCallback(`Chargement de la banque...`);
        fetch(`${Gw2ApiUrl}/account/bank?access_token=${apiKey}`).then(res => {
            if(!res.ok) {
                return Promise.reject(`Impossible de charger la banque...`);
            }
            return res.json();
        }).then(bank => {
            bank.forEach(i => {
                if(i) {
                    setItem(i.id, i.count, 'bank');
                }
            });
            data.bank = bank;
            successCallback();
        });
    });
}

function getMaterials() {
    return new Promise(successCallback => {
        logCallback(`Chargement de la banque de matériaux...`);
        fetch(`${Gw2ApiUrl}/account/materials?access_token=${apiKey}`).then(res => {
            if(!res.ok) {
                return Promise.reject(`Impossible de charger la banque de matériaux...`);
            }
            return res.json();
        }).then(materials => {
            materials.forEach(i => {
                if(i) {
                    setItem(i.id, i.count, 'materials');
                }
            });
            data.materials = materials;
            successCallback();
        });
    });
}

function setItemsChunks() {
    return new Promise(successCallback => {
        data.itemsChunks = arrayChunk(data.itemsId, chunkSize);
        successCallback();
    });
}

function getItemsData() {
    let chunks = data.itemsChunks;
    let total = chunks.length;

    let itemsList = [];

    for(let i = 0; i < total; i++) {
        let ids = chunks[i].join(',');
        itemsList.push(`${Gw2ApiUrl}/items?ids=${ids}`);
    }

    let current = 1;

    let promises = itemsList.map(url => {
        return fetch(url).then(function(res) {
            if(!res.ok) {
                return Promise.reject(`Impossible de charger les objets...`);
            }
            return res.json();
        }).then(items => {
            let pc = Math.round(current / total * 100);
            logCallback(`Chargement des objets ${pc} %...`);
            items.forEach(item => {
                data.itemsData[item.id] = item;
            });
            current++;
        });
    });

    return Promise.all(promises).then(() => {
        successCallback();
    }).catch(() => {
        return Promise.reject('Impossible de charger les objets...');
    });
}

function getItemsPrices() {
    let chunks = data.itemsChunks;
    let total = chunks.length;

    let pricesList = [];

    for(let i = 0; i < total; i++) {
        let ids = chunks[i].join(',');
        pricesList.push(`${Gw2ApiUrl}/commerce/prices?ids=${ids}`);
    }

    let current = 1;

    let promises = pricesList.map(url => {
        return fetch(url).then(function(res) {
            if(!res.ok) {
                return Promise.reject(`Impossible de charger les prix...`);
            }
            return res.json();
        }).then(prices => {
            let pc = Math.round(current / total * 100);
            logCallback(`Chargement des prix ${pc} %...`);
            prices.forEach(price => {
                data.itemsData[price.id].buys = price.buys;
                data.itemsData[price.id].sells = price.sells;
            });
            current++;
        });
    });

    return Promise.all(promises).then(() => {
        successCallback();
    }).catch(() => {
        return Promise.reject('Impossible de charger les prix...');
    });
}

function cleanAndSaveData() {
    return new Promise(successCallback => {
        logCallback('Nettoyage des données et sauvegarde...');

        delete data.materials;
        delete data.itemsId;
        delete data.itemsChunks;
        delete data.materials;

        localStorage.setItem('accountData', JSON.stringify(data));
        successCallback();
    });
}

function showAccountData(data) {
    log.innerHTML = '';
    accountData = localStorage.getItem('accountData');
    if(accountData) {
        data = JSON.parse(accountData);
        template('#template-account', {data}, '#account');
    }
}

function makeTheMagicHappen() {
    document.querySelector("#account").innerHTML = '';
    checkGW2ApiKeyPermissions().then(() => {
        return getCharacters();
    }).then(() => {
        return getInventories();
    }).then(() => {
        return getBank();
    }).then(() => {
        return getMaterials();
    }).then(() => {
        return setItemsChunks();
    }).then(() => {
        return getItemsData();
    }).then(() => {
        return getItemsPrices();
    }).then(() => {
        return cleanAndSaveData();
    }).then(() => {
        return showAccountData();
    });
}

let GW2ApiKeyIpt = document.querySelector('input#GW2ApiKey');
let GW2ApiKey = localStorage.getItem('GW2ApiKey');
if(GW2ApiKey) {
    GW2ApiKeyIpt.value = GW2ApiKey;
}

if(accountData) {
    showAccountData();
}

document.querySelector('button#makeTheMagicHappen').addEventListener('click', makeTheMagicHappen);

addEventListener('unhandledrejection', event => {
    log.classList.remove('text-green-500');
    log.classList.add('text-red-500');
    log.innerHTML = event.reason;
});

document.addEventListener('click',function(e){
    let d = JSON.parse(accountData);
    let parent = e.target.parentNode;

    if(parent.classList[0] === 'item' && typeof d.itemsData[parent.dataset.itemId] !== 'undefined') {

        document.querySelector('#details').classList.remove('hidden');

        let id = parent.dataset.itemId;

        template('#template-details', {
            'item': d.itemsData[id],
            'tip': tips[id],
            'storage': d.itemsStorage[id],
            'total': d.itemsMax[id]
        }, '#details');
    }
});