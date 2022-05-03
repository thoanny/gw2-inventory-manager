Handlebars.registerHelper('nl2br', function(text) {
    text = Handlebars.Utils.escapeExpression(text);
    text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
    return new Handlebars.SafeString(text);
});

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

function template(name, data, target, append = false) {
    let hb = Handlebars.compile(document.querySelector(name).innerHTML);
    if(append) {
        document.querySelector(target).innerHTML += hb(data);
    } else {
        document.querySelector(target).innerHTML = hb(data);
    }
}

let apiKey;
let Gw2ApiUrl = 'https://api.guildwars2.com/v2';

let loadingCount = 3;

let data = {
    'characters': {},
    'bank': [],
    'materials': [],
    'itemsMax': {},
    'itemsId': [],
    'itemsData': {},
    'itemsStorage': {}
};

let log = document.querySelector('#log');

document.addEventListener('loading', function (e) {
    loadingCount--;
    if(loadingCount === 0) {
        document.dispatchEvent(new CustomEvent('loading', {detail: `Chargement des objets...`}));
        getItems(data.itemsId);
    } else {
        log.innerHTML = e.detail;
    }
}, false);

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

function array_chunk(arr, chunkSize) {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        res.push(chunk);
    }
    return res;
}

function getItems(items) {
    const chunkSize = 150;
    let itemsChunks = 0;
    let itemsCurrent = 1;
    let loadingItems = itemsChunks;

    const ac = array_chunk(items, chunkSize);
    itemsChunks = ac.length;
    loadingItems = itemsChunks;

    for(let i = 0; i < itemsChunks; i++) {
        let ids = ac[i].join(',');

        fetch(`${Gw2ApiUrl}/items?ids=${ids}`)
            .then(res => {
                document.dispatchEvent(new CustomEvent('loading', {detail: `Chargement des objets ${itemsCurrent}/${itemsChunks}...`}))

                fetch(`${Gw2ApiUrl}/commerce/prices?ids=${ids}`)
                    .then(res => {
                        return res.json();
                    }).then(prices => {
                    prices.forEach(price => {
                        data.itemsData[price.id].buys = price.buys;
                        data.itemsData[price.id].sells = price.sells;
                    });
                });

                return res.json();
            }).then(items => {
            items.forEach(item => {
                data.itemsData[item.id] = item;
            });
            itemsCurrent++;
            loadingItems--;
        }).finally(() => {
            if(loadingItems === 0) {
                data.materials = {};
                data.itemsId = {};

                localStorage.setItem('accountData', JSON.stringify(data));
                accountData = JSON.stringify(data);
                document.dispatchEvent(new CustomEvent('loading', {detail: `Terminé !`}));
                showAccountData(data);
            }
        });


    }

}

function getCharacterInventory(c) {
    fetch(`${Gw2ApiUrl}/characters/${c}/inventory?access_token=${apiKey}`)
        .then(res => {
            document.dispatchEvent(new CustomEvent('loading', {detail: `Chargement de l'inventaire de ${c}...`}))
            return res.json();
        })
        .then(inventory => {
            inventory.bags.forEach(bag => {
                if(bag) {
                    bag.inventory.forEach(i => {
                        if(i) {
                            this.setItem(i.id, i.count, 'inventory', c);
                        }
                    });
                }
            });
            data.characters[c] = inventory;
        });
}

function getBank() {
    fetch(`${Gw2ApiUrl}/account/bank?access_token=${apiKey}`)
        .then(res => {
            document.dispatchEvent(new CustomEvent('loading', {detail: `Chargement de la banque...`}));
            return res.json();
        }).then(bank => {
        bank.forEach(i => {
            if(i) {
                this.setItem(i.id, i.count, 'bank');
            }
        });
        data.bank = bank;
    });
}

function getMaterials() {
    fetch(`${Gw2ApiUrl}/account/materials?access_token=${apiKey}`)
        .then(res => {
            document.dispatchEvent(new CustomEvent('loading', {detail: `Chargement de la banque de matériaux...`}));
            return res.json();
        }).then(materials => {
        materials.forEach(i => {
            if(i) {
                setItem(i.id, i.count, 'materials');
            }
        });
        data.materials = materials;
    });
}

function getUserData(apiKey) {
    fetch(`${Gw2ApiUrl}/characters?access_token=${apiKey}`)
        .then(res => res.json())
        .then(characters => {
            loadingCount += characters.length;
            characters.forEach(k => {
                this.getCharacterInventory(k)
            });
        }).then(() => {
        this.getBank();
    }).then(() => {
        this.getMaterials();
    });
}

function showAccountData(data) {
    document.dispatchEvent(new CustomEvent('loading', {detail: ``}));

    let html = '';

    for(const [character, inventory] of Object.entries(data.characters)) {
        html += `<h4>${character}</h4>`;
        html += `<div class="bags">`;
        inventory.bags.forEach(bag => {
            if(bag) {
                html += `<div class="bag size-${bag.size}">`;
                bag.inventory.forEach(item => {
                    if(item) {
                        let itemData = data.itemsData[item.id];
                        let rarity = (itemData && itemData.rarity) ? itemData.rarity : 'unknown';
                        let count = item.count;
                        let max = data.itemsMax[item.id];
                        if(max && max > count) {
                            count += `/${max}`;
                        }

                        html += `<div class="item rarity-${rarity}" data-item-id="${item.id}"><img src="https://v2.lebusmagique.fr/img/api/items/${item.id}.png" alt=""><span class="count">${count}</span></div>`;

                    } else {
                        html += `<div class="item empty"></div>`;
                    }
                });
                html += `</div>`;
            }

        });
        html += `</div>`;
    }

    document.querySelector("#account").innerHTML += html;

    html = '<h4>Banque</h4>';
    html += `<div class="bags"><div class="bag">`;

    data.bank.forEach((item, i) => {
        if(i%20 === 0 && i !== 0) {
            html += `</div><div class="bag">`;
        }
        if(item) {
            let itemData = data.itemsData[item.id];
            let rarity = (itemData && itemData.rarity) ? itemData.rarity : 'unknown';
            let count = item.count;
            let max = data.itemsMax[item.id];
            if(max && max > count) {
                count += `/${max}`;
            }
            html += `<div class="item rarity-${rarity}" data-item-id="${item.id}"><img src="https://v2.lebusmagique.fr/img/api/items/${item.id}.png" alt=""><span class="count">${count}</span></div>`;
        } else {
            html += `<div class="item empty"></div>`;
        }
    });

    html += `</div></div>`;

    document.querySelector("#account").innerHTML += html;

}

let GW2ApiKeyIpt = document.querySelector('input#GW2ApiKey');
let GW2ApiKey = localStorage.getItem('GW2ApiKey');
if(GW2ApiKey) {
    GW2ApiKeyIpt.value = GW2ApiKey;
}

document.querySelector('button#makeTheMagicHappen').addEventListener('click', () => {

    document.querySelector("#account").innerHTML = '';

    fetch(`${Gw2ApiUrl}/tokeninfo?access_token=${GW2ApiKeyIpt.value}`)
        .then((res) => {
            if(res.ok) {
                log.innerHTML = 'Vérification de la clé API...';
                return res.json();
            } else {
                if(res.status === 401){
                    log.innerHTML = `<span class="text-red-500">Clé API Guild Wars 2 invalide...</span>`;
                } else {
                    log.innerHTML = `<span class="text-red-500">Erreur ${res.status}</span>`;
                }
            }
        })
        .then((data) => {
            // Vérifier les autorisations : account, inventories, characters
            if(
                data.permissions.indexOf('account') >= 0 &&
                data.permissions.indexOf('inventories') >= 0 &&
                data.permissions.indexOf('characters') >= 0
            ) {
                localStorage.setItem('GW2ApiKey', GW2ApiKeyIpt.value);
                apiKey = GW2ApiKeyIpt.value;
                document.dispatchEvent(new CustomEvent('loading', {detail: `Initialisation du script...`}));
                getUserData(GW2ApiKeyIpt.value);
            } else {
                log.innerHTML = `<span class="text-red-500">Autorisations requises&nbsp;: account, inventories et characters.</span>`;
            }
        });
});

let accountData = localStorage.getItem('accountData');

if(accountData) {
    showAccountData(JSON.parse(accountData));
}

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
