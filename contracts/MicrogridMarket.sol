pragma solidity ^0.8.20;

library Utils {
    uint public constant MIN_TRUST_SCORE = 1;
    uint public constant MAX_TRUST_SCORE = 5;
}

contract SmartHomeFactory{
    address[] public deployedHouseholds;
    address public owner;
    event SmartHomeCreated(address smarthomeAddress);
    
    constructor() {
        owner = address(this);
    }
    
    function createHousehold(uint capacity) public {
        SmartHome h = new SmartHome(capacity, msg.sender, owner);
        address newHousehold = address(h);
        deployedHouseholds.push(newHousehold);
        emit SmartHomeCreated(newHousehold);
    }
    
    function getDeployedHouseholds() public view returns (address[] memory) {
        return deployedHouseholds;
    }
}

contract SmartHome{
    struct Order{
        address origin;
        uint price;
        uint amount;
        uint date;
    }

    struct SuccessfulBid{
        address recipient;
        uint price;
        uint amount;
        uint date;
    }

    uint public currentDemand;
    uint public currentSupply;
    uint public batteryCapacity;
    uint public amountOfCharge;
    uint public excessEnergy;
    uint public trustScore;

    Order[] public buyOrders;
    Order[] public sellOrders;
    SuccessfulBid[] public SuccessfulBids;
    address public owner;
    address public contractAddress;
    address public parent;
    address payable public exchangeAddress;
    uint public balanceContract;
    MicrogridMarket ex;
    SmartHome hh;
    
    
    constructor(uint capacity, address creator, address watch_address) payable{
        owner = creator;
        batteryCapacity = capacity;
        amountOfCharge = capacity;
        parent = watch_address;
        contractAddress = address(this);
    }
    
    function deposit() public payable {
    }
    
    receive() external payable {
    }

    fallback() external payable {}

    function setSmartMeterDetails(uint _demand, uint _supply, uint _excessEnergy) public {
        currentDemand = _demand;
        currentSupply = _supply;
        excessEnergy = _excessEnergy;
    }

    function getSmartMeterDetails() public view returns(address, uint, uint, uint, uint, uint){
        return(
            owner,
            currentDemand,
            currentSupply,
            batteryCapacity,
            amountOfCharge,
            excessEnergy
        );
    }

    
    function getBid(uint index) public view returns(address, uint, uint, uint){
        return (buyOrders[index].origin,
                buyOrders[index].price,
                buyOrders[index].amount,
                buyOrders[index].date
        );
    }

    function getAsk(uint index) public view returns(address, uint, uint, uint){
        return (sellOrders[index].origin,
                sellOrders[index].price,
                sellOrders[index].amount,
                sellOrders[index].date
        );
    }

    function getSuccessfulBid(uint index) public view returns(address, uint, uint, uint){
        return (SuccessfulBids[index].recipient,
                SuccessfulBids[index].price,
                SuccessfulBids[index].amount,
                SuccessfulBids[index].date
        );
    }

    function getSuccessfulBidCount() public view returns(uint) {
        return SuccessfulBids.length;
    }

    function setExchange(address payable exchange) public {
        exchangeAddress = exchange;
    }
    
    function charge(uint amount) public onlySmartHomeOwner{
        if(amountOfCharge + amount >= batteryCapacity) {
            amountOfCharge = batteryCapacity;
        }
        else{
            amountOfCharge += amount;
        }
        
    }
    
    function discharge(uint amount) public {
        if(amountOfCharge - amount <= 0) {
            amountOfCharge = 0;
        }
        else{
            amountOfCharge -= amount;
        }
    }
    
    function submitBid(uint price, uint amount, uint timestamp) public onlySmartHomeOwner {
        Order memory newBid = Order({
            origin: contractAddress,
            price: price,
            amount: amount,
            date: timestamp
        });
        
        buyOrders.push(newBid);
        ex = MicrogridMarket(payable(exchangeAddress));
        ex.placeBuyOrder(price, amount, timestamp);
        
    }
    
    function submitAsk(uint price, uint amount, uint timestamp) public onlySmartHomeOwner {
        Order memory newAsk = Order({
            origin: contractAddress,
            price: price,
            amount: amount,
            date: timestamp
        });
        
        sellOrders.push(newAsk);
        ex = MicrogridMarket(payable(exchangeAddress));
        ex.placeSellOrder(price, amount, timestamp);
    }

    function buyEnergy(uint _amount, address payable _recipient, uint _price, uint _date ) public payable returns(bool successful){
        SuccessfulBid memory newBid = SuccessfulBid({
            recipient: _recipient,
            price: _price,
            amount: _amount,
            date: _date
        });

        amountOfCharge += _amount;

        hh = SmartHome(_recipient);
        hh.discharge(_amount);


        (bool sent, ) = _recipient.call{value: _amount * _price}("");
        require(sent, "Failed to send Ether");
        SuccessfulBids.push(newBid);
        
        return true;
    }

    function deleteBid(uint bid_index) public {
        ex = MicrogridMarket(payable(exchangeAddress));
        ex.removeBid(bid_index);
    }

    function deleteAsk(uint ask_index) public {
        ex = MicrogridMarket(payable(exchangeAddress));
        ex.removeAsk(ask_index);
    }

    function getBidsCount() public view returns(uint) {
        return buyOrders.length;
    }
    
    function getAsksCount() public view returns(uint) {
        return sellOrders.length;
    }

    function addTrustScore(uint score) public {
        require(score >= Utils.MIN_TRUST_SCORE && score <= Utils.MAX_TRUST_SCORE, 
            "score number should use Likert scaling of [1, 5]" );

        trustScore += score;
    }

    function getOwner() public view returns(address) {
        return owner;
    }

    modifier onlySmartHomeOwner() {
        require(msg.sender == owner);
        _;
    }
}

contract MicrogridMarket {

    struct Order {
        address payable owner;
        uint price;
        uint amount;
        uint date;
    }

    Order[] public buyOrders;
    Order[] public sellOrders;
    mapping (address => mapping(address => bool)) unratedInteractions;
    mapping (address => uint) trustScores;
    address public owner;

    constructor(address _owner) payable{
        owner = _owner;
    }
    
    function deposit() public payable {
    }

    receive() external payable {}
    fallback() external payable {}

    function getBid(uint index) public view returns(address, uint, uint, uint){
        return (buyOrders[index].owner, buyOrders[index].price, buyOrders[index].amount, buyOrders[index].date);
    }

    function getAsk(uint index) public view returns(address, uint, uint, uint){
        return (sellOrders[index].owner, sellOrders[index].price, sellOrders[index].amount, sellOrders[index].date);
    }

    function placeBuyOrder(uint _price, uint _amount, uint timestamp) public {
        Order memory b;
        b.owner = payable(msg.sender);
        b.price = _price;
        b.amount = _amount;
        b.date = timestamp;

        // find the bid place in the array and resize the array accordingly
        for(uint i = 0; i < buyOrders.length; i++) {
            if(buyOrders[i].price > _price) {
                Order[] memory tempBids = new Order[](buyOrders.length - i);
                for(uint j = i; j < buyOrders.length; j++) {
                    tempBids[j-i] = buyOrders[j];
                }
                buyOrders[i] = b;
                buyOrders.push();
                for(uint k = 0; k < tempBids.length; k++) {
                     buyOrders[i+k+1] = tempBids[k];
                }
                
                if(sellOrders.length>0){
                    matchOrders(buyOrders.length-1 ,sellOrders.length-1 );
                }

                // the placement and sorting is done, so
                return;
            }
        }

        // the bid was deemed the least prior bid, so add it to the end
        buyOrders.push(b);
        if(sellOrders.length>0){
            matchOrders(buyOrders.length-1 ,sellOrders.length-1 );
        }
    }

    function placeSellOrder(uint _price, uint _amount, uint timestamp) public {
        Order memory a;
        a.owner = payable(msg.sender);
        a.price = _price;
        a.amount = _amount;
        a.date = timestamp;

        // iterate on the asks array to sort the asks
        for (uint i = 0; i < sellOrders.length; i ++) {
            if(sellOrders[i].price < _price) {
                Order[] memory tempAsks = new Order[](sellOrders.length - i);
                for (uint j = i; j < sellOrders.length; j++) {
                    tempAsks[j-i] = sellOrders[j];
                }
                sellOrders[i] = a;
                sellOrders.push();
                for (uint k = 0; k < tempAsks.length; k++) {
                    sellOrders[i+k+1] = tempAsks[k];
                }
              
                if (buyOrders.length>0){
                    matchOrders(buyOrders.length-1,sellOrders.length-1 );
                }
                // the ask is placed and the array is resized;
                // we can exit the function now
                return;
            }
        }

        // the ask's price was bigger than all previous asks. so push it at the end
        sellOrders.push(a);
        if(buyOrders.length > 0) {
            matchOrders(buyOrders.length-1,sellOrders.length-1 );
        }
    }
    
    function matchOrders(uint bid_index, uint ask_index) public returns (bool) {
        if (buyOrders.length == 0 || sellOrders.length == 0 || buyOrders[bid_index].price < sellOrders[ask_index].price) {
            return true;
        }

        SmartHome buyer = SmartHome(buyOrders[bid_index].owner);
        SmartHome seller = SmartHome(sellOrders[ask_index].owner);

        uint price = buyOrders[bid_index].price;

        if(int(buyOrders[bid_index].amount - sellOrders[ask_index].amount) >= 0){
            uint remainder = buyOrders[bid_index].amount - sellOrders[ask_index].amount;
            uint calcAmount = buyOrders[bid_index].amount - remainder;
            
            buyer.buyEnergy(calcAmount, payable(seller), price, buyOrders[bid_index].date);

            buyOrders[bid_index].amount = remainder;
            if(remainder==0){
                removeBid(bid_index);
                recordInteraction(buyer.getOwner(), seller.getOwner());
                recordInteraction(seller.getOwner(), buyer.getOwner());
            }
            removeAsk(ask_index);
            if(buyOrders.length == 0 || sellOrders.length == 0)
                return false;
            
            return (matchOrders(buyOrders.length-1,sellOrders.length-1));
        }
        
        if(int(buyOrders[bid_index].amount - sellOrders[ask_index].amount) < 0){
            uint remainder = sellOrders[ask_index].amount - buyOrders[bid_index].amount;
            uint calcAmount = sellOrders[ask_index].amount - remainder;
            
            buyer.buyEnergy(calcAmount, sellOrders[ask_index].owner, price, buyOrders[bid_index].date);

            sellOrders[ask_index].amount = remainder;
            if(remainder == 0){
                removeAsk(ask_index);
                recordInteraction(buyer.getOwner(), seller.getOwner());
                recordInteraction(seller.getOwner(), buyer.getOwner());
            }
            removeBid(bid_index);
            
            if(buyOrders.length == 0 || sellOrders.length == 0) 
                return false;
            
            return (matchOrders(buyOrders.length-1,sellOrders.length-1)); 
        }

        return false;
    }

    function removeBid(uint index) public {
        if (index >= buyOrders.length) return;
        
        for (uint i = index; i<buyOrders.length-1; i++){
            buyOrders[i] = buyOrders[i+1];
        }
        buyOrders.pop();
    }

    function removeAsk(uint index) public {
        if (index >= sellOrders.length) return;
        
        for (uint i = index; i<sellOrders.length-1; i++){
            sellOrders[i] = sellOrders[i+1];
        }
        sellOrders.pop();
    }

    function getBidsCount() public view returns(uint) {
        return buyOrders.length;
    }
    
    function getAsksCount() public view returns(uint) {
        return sellOrders.length;
    }

    function recordInteraction(address sender, address receiver) public {
        unratedInteractions[sender][receiver] = true;
    }

    function getUnratedInteractions(address interactionStarter, address receiver) public view returns (bool) {
        return unratedInteractions[interactionStarter][receiver];
    }

    function rateInteraction(address payable receiver, uint score) public  {
        
        require(unratedInteractions[msg.sender][receiver], "There are no interaction for sender's address");

        // the interaction was found, so gave them the right vote
        trustScores[receiver] += score;
        
        // after adding the trust vote score, prevent double voting
        unratedInteractions[msg.sender][receiver] = false;
    }
}