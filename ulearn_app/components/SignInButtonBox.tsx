import { SignInButton } from "@clerk/nextjs";

export const SignInButtonBox= ({ text,classNameC = ""}: { text: string,classNameC?: string}) =>{
    return(
        <div  className={classNameC} >
             <SignInButton mode="modal" forceRedirectUrl={"/"} fallbackRedirectUrl={"/"}
              signUpForceRedirectUrl={"/"} signUpFallbackRedirectUrl={"/"}
              appearance={{ variables: { colorPrimary: "#2a0369", borderRadius: "10px" } }}> 
              {text}</SignInButton>
        </div>
    )
}