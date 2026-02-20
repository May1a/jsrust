mod math {
    pub fn add(a: i32, b: i32) -> i32 {
        a + b
    }
    pub fn sub(a: i32, b: i32) -> i32 {
        a - b
    }
}

use math::{add, sub as sub_math};

fn main() {
    let result = add(1, 2);
    println!("{}", result);
    let result2 = sub_math(1, 2);
    println!("{}", result2);
}