using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Handles setting the Hit Threshold of the Image component to 0.2f (of the game object the script is attached to)
/// </summary>
public class ToothSpriteHelper : MonoBehaviour
{
    // Start is called before the first frame update
    void Start()
    {
        this.gameObject.GetComponent<Image>().alphaHitTestMinimumThreshold = 0.2f;
    }

    // Update is called once per frame
    void Update()
    {
        
    }
}
