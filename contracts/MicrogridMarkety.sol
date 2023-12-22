pragma solidity ^0.8.20;

contract HouseholdFactory{
    address[] public deployedHouseholds;
    address public owner;
    
    constructor() public{
        owner = address(this);
    }
    
    function createHousehold(uint capacity) public{
        SmartHome h = new SmartHome(capacity, msg.sender, owner);
        address newHousehold = address(h);
        deployedHouseholds.push(newHousehold);
    }
    
    function getDeployedHouseholds() public view returns (address[] memory) {
        return deployedHouseholds;
    }
}

contract SmartHome{
    
    uint public currentDemand;
    uint public currentSupply;
    uint public batteryCapacity;
    uint public amountOfCharge;
    uint public excessEnergy;
    
    struct Bid{
        address origin;
        uint price;
        uint amount;
        uint date;
    }

    struct BidSuccessful{
        address recipient;
        uint price;
        uint amount;
        uint date;
    }
    
    Bid[] public Bids;
    Bid[] public Asks;
    BidSuccessful[] public SuccessfulBids;
    address public owner;
    address public contractAddress;
    address public parent;
    address public exchangeAddress;
    uint public balanceContract;
    MicrogridMarket ex;
    SmartHome hh;
    
    
    constructor(uint capacity, address creator, address watch_address) public payable{
        owner = creator;
        batteryCapacity = capacity;
        amountOfCharge = capacity;
        parent = watch_address;
        contractAddress = address(this);
    }
    
    function deposit() public payable {
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
        return (Bids[index].origin,
                Bids[index].price,
                Bids[index].amount,
                Bids[index].date
        );
    }

    function getAsk(uint index) public view returns(address, uint, uint, uint){
        return (Asks[index].origin,
                Asks[index].price,
                Asks[index].amount,
                Asks[index].date
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

    function setExchange(address exchange) public {
        exchangeAddress = exchange;
    }
    
    function charge(uint amount) public restricted{
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
    
    function submitBid(uint price, uint amount, uint timestamp) public restricted returns (bool){
        Bid memory newBid = Bid({
            origin: contractAddress,
            price: price,
            amount: amount,
            date: timestamp
        });
        
        Bids.push(newBid);
        ex = MicrogridMarket(payable(exchangeAddress));
        return ex.placeBid(price, amount, timestamp);
        
    }
    
    function submitAsk(uint price, uint amount, uint timestamp) public restricted returns(bool) {
        Bid memory newAsk = Bid({
            origin: contractAddress,
            price: price,
            amount: amount,
            date: timestamp
        });
        
        Asks.push(newAsk);
        ex = MicrogridMarket(payable(exchangeAddress));
        return ex.placeAsk(price, amount, timestamp);
    }

    function buyEnergy(uint _amount, address payable _recipient, uint _price, uint _date ) public payable returns(bool successful){
        BidSuccessful memory newBid = BidSuccessful({
            recipient: _recipient,
            price: _price,
            amount: _amount,
            date: _date
        });

        amountOfCharge += _amount;

        hh = SmartHome(_recipient);
        hh.discharge(_amount);


        _recipient.transfer( (_amount/1000)*_price);
       
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
        return Bids.length;
    }
    
    function getAsksCount() public view returns(uint) {
        return Asks.length;
    }

    modifier restricted() {
        require(msg.sender == owner);
        _;
    }
    
}

contract MicrogridMarket {

    struct Bid {
        address payable owner;
        uint price;
        uint amount;
        uint date;
    }

    struct Ask {
        address payable owner;
        uint price;
        uint amount;
        uint date;
    }

    Bid[] public Bids;
    Ask[] public Asks;
    SmartHome hh;
    address public owner;

    constructor(address _owner) public payable{
        owner = _owner;
    }
    
    function deposit() public payable {
    }

    fallback() external payable {}

    function getBid(uint index) public returns(address, uint, uint, uint){
        return (Bids[index].owner, Bids[index].price, Bids[index].amount, Bids[index].date);
    }

    function getAsk(uint index) public  returns(address, uint, uint, uint){
        return (Asks[index].owner, Asks[index].price, Asks[index].amount, Asks[index].date);
    }


    function placeBid(uint _price, uint _amount, uint timestamp) public returns (bool) {
        Bid memory b;
        b.owner = payable(msg.sender);
        b.price = _price;
        b.amount = _amount;
        b.date = timestamp;

        for(uint i = 0; i < Bids.length; i++) {
            if(Bids[i].price > _price) {
                Bid[] memory tempBids = new Bid[](Bids.length - i);
                for(uint j = i; j < Bids.length; j++) {
                    tempBids[j-i] = Bids[j];
                }
                Bids[i] = b;
                Bids.push();
                for(uint k = 0; k < tempBids.length; k++) {
                     Bids[i+k+1] = tempBids[k];
                }
                
                if(Asks.length>0){
                    matchBid(Bids.length-1 ,Asks.length-1 );
                }
                return true;
            }
        }

        Bids.push(b);
        if(Asks.length>0){
            
            matchBid(Bids.length-1 ,Asks.length-1 );
            
        }
        return true;
    }

    function placeAsk(uint _price, uint _amount, uint timestamp) public returns (bool) {
        Ask memory a;
        a.owner = payable(msg.sender);
        a.price = _price;
        a.amount = _amount;
        a.date = timestamp;


        for (uint i = 0; i < Asks.length; i ++) {
            if(Asks[i].price < _price) {
                Ask[] memory tempAsks = new Ask[](Asks.length - i);
                for (uint j = i; j < Asks.length; j++) {
                    tempAsks[j-i] = Asks[j];
                }
                Asks[i] = a;
                Asks.push();
                for (uint k = 0; k < tempAsks.length; k++) {
                    Asks[i+k+1] = tempAsks[k];
                }
              
                if (Bids.length>0){
                    matchBid(Bids.length-1,Asks.length-1 );
                }
                return true;
            }
        }
        Asks.push(a);
        if(Bids.length > 0) {
            matchBid(Bids.length-1,Asks.length-1 );
        }
        return true;
    }
    
    function matchBid(uint bid_index, uint ask_index) public returns (bool) {
        if (Bids.length == 0 || Asks.length == 0 || Bids[bid_index].price < Asks[ask_index].price) {
            return true;
        }

        hh = SmartHome(Bids[bid_index].owner);
        
        //uint price = (Asks[ask_index].price + Bids[bid_index].price) / 2;
        uint price = Bids[bid_index].price;

        if(int(Bids[bid_index].amount - Asks[ask_index].amount) >= 0){
            uint remainder = Bids[bid_index].amount - Asks[ask_index].amount;
            uint calcAmount = Bids[bid_index].amount - remainder;
            
            hh.buyEnergy(calcAmount, Asks[ask_index].owner, price, Bids[bid_index].date);

            Bids[bid_index].amount = remainder;
            if(remainder==0){
                removeBid(bid_index);
            }
            removeAsk(ask_index);
            
            return (matchBid(Bids.length-1,Asks.length-1));
        }
        
        if(int(Bids[bid_index].amount - Asks[ask_index].amount) < 0){
            uint remainder = Asks[ask_index].amount - Bids[bid_index].amount;
            uint calcAmount = Asks[ask_index].amount - remainder;
            
            hh.buyEnergy(calcAmount, Asks[ask_index].owner, price, Bids[bid_index].date);

            Asks[ask_index].amount = remainder;
            if(remainder == 0){
                removeAsk(ask_index);
            }
            removeBid(bid_index);
            
            return (matchBid(Bids.length-1,Asks.length-1)); 
        }
    }

    function removeBid(uint index) public {
        if (index >= Bids.length) return;
        
        for (uint i = index; i<Bids.length-1; i++){
            Bids[i] = Bids[i+1];
        }
        Bids.pop();
    }

    function removeAsk(uint index) public {
        if (index >= Asks.length) return;
        
        for (uint i = index; i<Asks.length-1; i++){
            Asks[i] = Asks[i+1];
        }
        Asks.pop();
    }

    function getBidsCount() public view returns(uint) {
        return Bids.length;
    }
    
    function getAsksCount() public view returns(uint) {
        return Asks.length;
    }
}