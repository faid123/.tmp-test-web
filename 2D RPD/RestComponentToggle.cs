using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class RestComponentToggle : MonoBehaviour
{
    public GenericToothSelection toothSelection;
    public ComponentPlacer compPlacer;
    public RPDComponent component;
    public GenericTooth tooth;

    /// <summary>
    /// Handles UI toggling of Mesial Rest placement on Posterior tooth
    /// </summary>
    /// <param name="isOn">Bool to check if rest is ON/Set</param>
    public void MesialRestToggling(bool isOn)
    {
        //isOn means to place the component
        if (isOn)
        {
            if (RPDManager.instance.useNew2DSystem)
                compPlacer.PlaceComponent();


            else
                toothSelection.ToothActionClick(8);
        }

        //component is off and remove it
        else
        {
            if (RPDManager.instance.useNew2DSystem)
                RPDManager.instance.RemoveComponent(component, tooth.ToothIndex);

            else
                tooth.RemoveComponent(RPD_2DComponent.componentType.p_mesial);
        }
    }
    /// <summary>
    /// Handles UI toggling of Distal Rest placement on Posterior tooth
    /// </summary>
    /// <param name="isOn">Bool to check if rest is ON/Set</param>
    public void DistalRestToggling(bool isOn)
    {
        //isOn means to place the component
        if (isOn)
        {
            if (RPDManager.instance.useNew2DSystem)
                compPlacer.PlaceComponent();

            else
                toothSelection.ToothActionClick(9);
        }

        //component is off and remove it
        else
        {
            if (RPDManager.instance.useNew2DSystem)
                RPDManager.instance.RemoveComponent(component, tooth.ToothIndex);

            else
                tooth.RemoveComponent(RPD_2DComponent.componentType.p_distal);
        }
    }
    /// <summary>
    /// Handles UI toggling of Lingual Rest placement on Posterior tooth
    /// </summary>
    /// <param name="isOn">Bool to check if rest is ON/Set</param>
    public void LingualRestToggling(bool isOn)
    {
        //isOn means to place the component
        if (isOn)
        {
            if (RPDManager.instance.useNew2DSystem)
                compPlacer.PlaceComponent();

            else
                toothSelection.ToothActionClick(10);
        }

        //component is off and remove it
        else
        {
            if (RPDManager.instance.useNew2DSystem)
                RPDManager.instance.RemoveComponent(component, tooth.ToothIndex);

            else
                tooth.RemoveComponent(RPD_2DComponent.componentType.p_lingual);
        }
    }
    /// <summary>
    /// Handles UI toggling of Incisal Mesial Rest placement on Anterior tooth
    /// </summary>
    /// <param name="isOn">Bool to check if rest is ON/Set</param>
    public void IncisalMesialRestToggling(bool isOn)
    {
        //isOn means to place the component
        if (isOn)
        {
            if (RPDManager.instance.useNew2DSystem)
                compPlacer.PlaceComponent();


            else
                toothSelection.ToothActionClick(11);
        }

        //component is off and remove it
        else
        {
            if (RPDManager.instance.useNew2DSystem)
                RPDManager.instance.RemoveComponent(component, tooth.ToothIndex);

            else
                tooth.RemoveComponent(RPD_2DComponent.componentType.ai_mesial);
        }
    }
    /// <summary>
    /// Handles UI toggling of Incisal Distal Rest placement on Anterior tooth
    /// </summary>
    /// <param name="isOn">Bool to check if rest is ON/Set</param>
    public void IncisalDistalRestToggling(bool isOn)
    {
        //isOn means to place the component
        if (isOn)
        {
            if (RPDManager.instance.useNew2DSystem)
                compPlacer.PlaceComponent();


            else
                toothSelection.ToothActionClick(12);
        }

        //component is off and remove it
        else
        {
            if (RPDManager.instance.useNew2DSystem)
                RPDManager.instance.RemoveComponent(component, tooth.ToothIndex);

            else
                tooth.RemoveComponent(RPD_2DComponent.componentType.ai_distal);
        }
    }

    void Start()
    {

    }

    /// <summary>
    /// Called when object becomes enabled and active
    /// Handles the checking of the current tooth and the Rest components on it.
    /// If there are any Rests on the tooth, make sure the toggles are ON, else make sure the toggles are OFF
    /// </summary>
    private void OnEnable()
    {
        //tooth is a Posterior tooth
        if (tooth.ToothData.ti.tooth_type == (int)Tooth_Type.posterior)// && tooth.ToothData.tr.posterior_rest_type == Posterior_Rest_Type.pr_non_full)
        {
            if (tooth.HasComponent(RPD_2DComponent.componentType.p_mesial)) //ToothData.tr.pr_config1 == true)posterior_rest_position == Posterior_Rest_Position.p_mesial)
                CheckSelfName("Mesial"); //MesialRestToggling(true);

            else if (tooth.HasComponent(RPD_2DComponent.componentType.p_distal))//.ToothData.tr.pr_config3).posterior_rest_position == Posterior_Rest_Position.p_distal)
                CheckSelfName("Distal"); //DistalRestToggling(true);

            else if (tooth.HasComponent(RPD_2DComponent.componentType.p_lingual))//.ToothData.tr.pr_config2)posterior_rest_position == Posterior_Rest_Position.p_lingual)
                CheckSelfName("Lingual"); //LingualRestToggling(true);
                                         
            //if none of the above then make sure it's all OFF
            else
            {
                gameObject.GetComponent<Toggle>().SetIsOnWithoutNotify(false);
            }
        }

        //tooth is an Anterior Tooth
        else if (tooth.ToothData.ti.tooth_type == (int)Tooth_Type.anterior)// && tooth.ToothData.tr.anterior_rest == Anterior_Rest.ar_incisal)
        {
            if (tooth.HasComponent(RPD_2DComponent.componentType.ai_mesial))//.ToothData.tr.anterior_incisal_rest_type == Anterior_Incisal_Rest_Type.ai_mesial)
            {
                CheckSelfName("I-Mesial"); //IncisalMesialRestToggling(true);
            }

            else if (tooth.HasComponent(RPD_2DComponent.componentType.ai_distal))//.ToothData.tr.anterior_incisal_rest_type == Anterior_Incisal_Rest_Type.ai_distal)
            {
                CheckSelfName("I_Distal"); //IncisalDistalRestToggling(true);
            }

            //if none of the above then make sure it's all OFF
            else
            {
                gameObject.GetComponent<Toggle>().SetIsOnWithoutNotify(false);
            }
        }

        //if none of the above then make sure it's all OFF
        else
        {
            gameObject.GetComponent<Toggle>().SetIsOnWithoutNotify(false);
        }
    }

    /// <summary>
    /// Just Checks that its own name matches the relevant component and then toggles itself ON appropriately
    /// </summary>
    /// <param name="name">String input to check against with the beginning section of the game object name</param>
    void CheckSelfName(string name)
    {
        print("Rest Toggle : " + gameObject.name);

        if (gameObject.name. StartsWith(name))
            gameObject.GetComponent<Toggle>().SetIsOnWithoutNotify(true);
        else
            return;
    }

    // Update is called once per frame
    void Update()
    {
        
    }
}
