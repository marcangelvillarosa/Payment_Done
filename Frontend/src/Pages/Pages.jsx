
import {Routes, Route} from "react-router-dom";
import SignIn from "../Login/SignIn";
import SignUp from "../Login/SignUp";
import Home from "../Homepage/Home";
import Payment from "../Payment/Payment"

function Pages() {
    return (
      <Routes>
        <Route path="/" element={<SignIn/>}/>
        <Route path="SignUp" element={<SignUp/>}/>
        <Route path="Home" element={<Home/>} />
        <Route path="Payment" element={<Payment/>}/>
      </Routes>
    );
  }

export default Pages;